const pool = require('../db');

// Create a transaction (seller marks as sold)
exports.createTransaction = async (req, res) => {
  const sellerId = req.user.id;
  const { productId, buyerId, agreedPrice, meetingMethod, notes } = req.body;

  try {
    // Verify the product belongs to the seller
    const productResult = await pool.query(
      'SELECT id, name, images, slug, owner_id FROM products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];
    
    if (product.owner_id !== sellerId.toString()) {
      return res.status(403).json({ error: 'You are not the owner of this product' });
    }

    // Check if transaction already exists
    const existingTransaction = await pool.query(
      'SELECT id FROM transactions WHERE product_id = $1 AND seller_id = $2 AND buyer_id = $3 AND status != $4',
      [productId, sellerId, buyerId, 'cancelled']
    );

    if (existingTransaction.rows.length > 0) {
      return res.status(400).json({ error: 'Transaction already exists for this product and buyer' });
    }

    // Get product image
    let productImage = null;
    if (product.images) {
      const images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
      productImage = images.length > 0 ? images[0] : null;
    }

    // Create transaction
    const result = await pool.query(
      `INSERT INTO transactions 
       (product_id, product_title, product_image, product_slug, seller_id, buyer_id, 
        agreed_price, meeting_method, notes, seller_confirmed, seller_confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, CURRENT_TIMESTAMP)
       RETURNING *`,
      [productId, product.name, productImage, product.slug, sellerId, buyerId, 
       agreedPrice, meetingMethod, notes]
    );

    // Update product status to 'sold'
    await pool.query(
      `UPDATE products SET status = 'sold', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [productId]
    );

    res.status(201).json({
      message: 'Transaction created. Waiting for buyer confirmation.',
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
};

// Buyer confirms transaction
exports.confirmTransaction = async (req, res) => {
  const buyerId = req.user.id;
  const { transactionId } = req.params;

  try {
    // Get transaction
    const transactionResult = await pool.query(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = transactionResult.rows[0];

    if (transaction.buyer_id !== buyerId) {
      return res.status(403).json({ error: 'You are not the buyer in this transaction' });
    }

    if (transaction.buyer_confirmed) {
      return res.status(400).json({ error: 'You have already confirmed this transaction' });
    }

    // Update transaction
    const result = await pool.query(
      `UPDATE transactions 
       SET buyer_confirmed = true, buyer_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [transactionId]
    );

    res.json({
      message: 'Transaction confirmed successfully',
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Error confirming transaction:', error);
    res.status(500).json({ error: 'Failed to confirm transaction' });
  }
};

// Get pending transactions for user
exports.getPendingTransactions = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT t.*, 
              seller.username as seller_username, seller.profile_picture as seller_profile_picture,
              buyer.username as buyer_username, buyer.profile_picture as buyer_profile_picture
       FROM transactions t
       LEFT JOIN users seller ON t.seller_id = seller.id
       LEFT JOIN users buyer ON t.buyer_id = buyer.id
       WHERE (t.seller_id = $1 OR t.buyer_id = $1)
         AND t.status = 'pending'
         AND (
           (t.seller_id = $1 AND t.buyer_confirmed = false) OR
           (t.buyer_id = $1 AND t.seller_confirmed = false)
         )
       ORDER BY t.created_at DESC`,
      [userId]
    );

    res.json({ transactions: result.rows });
  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    res.status(500).json({ error: 'Failed to fetch pending transactions' });
  }
};

// Get confirmed transactions for user
exports.getConfirmedTransactions = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT t.*, 
              seller.username as seller_username, seller.profile_picture as seller_profile_picture,
              buyer.username as buyer_username, buyer.profile_picture as buyer_profile_picture,
              (SELECT COUNT(*) FROM user_reviews WHERE transaction_id = t.id AND reviewer_id = $1) as user_has_reviewed
       FROM transactions t
       LEFT JOIN users seller ON t.seller_id = seller.id
       LEFT JOIN users buyer ON t.buyer_id = buyer.id
       WHERE (t.seller_id = $1 OR t.buyer_id = $1)
         AND t.status = 'confirmed'
       ORDER BY t.confirmed_at DESC`,
      [userId]
    );

    res.json({ transactions: result.rows });
  } catch (error) {
    console.error('Error fetching confirmed transactions:', error);
    res.status(500).json({ error: 'Failed to fetch confirmed transactions' });
  }
};

// Get potential buyers for a product (users who messaged about it)
exports.getPotentialBuyers = async (req, res) => {
  const sellerId = req.user.id;
  const { productId } = req.params;

  try {
    // Verify product ownership
    const productResult = await pool.query(
      'SELECT owner_id, name, slug FROM products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (productResult.rows[0].owner_id !== sellerId.toString()) {
      return res.status(403).json({ error: 'You are not the owner of this product' });
    }

    const product = productResult.rows[0];

    // Smart algorithm to find potential buyers
    // 1. Get users who have chatted with seller
    // 2. Analyze message content for buying intent keywords
    // 3. Filter by recent activity (last 60 days)
    // 4. Score based on engagement and keywords
    const result = await pool.query(
      `WITH chat_users AS (
         -- Get all users who have direct chats with the seller
         SELECT DISTINCT 
           u.id, 
           u.username, 
           u.profile_image as profile_picture, 
           CONCAT(u.first_name, ' ', u.last_name) as full_name,
           c.id as chat_id,
           c.created_at as chat_created_at
         FROM users u
         INNER JOIN chat_participants cp1 ON cp1.user_id = u.id
         INNER JOIN chat_participants cp2 ON cp2.chat_id = cp1.chat_id
         INNER JOIN chats c ON c.id = cp1.chat_id
         WHERE cp2.user_id = $1
           AND u.id != $1
           AND c.type = 'direct'
           AND cp1.left_at IS NULL
           AND cp2.left_at IS NULL
       ),
       message_analysis AS (
         -- Analyze messages for buying intent
         SELECT 
           cu.id,
           cu.username,
           cu.profile_picture,
           cu.full_name,
           cu.chat_id,
           COUNT(m.id) as message_count,
           MAX(m.created_at) as last_message_at,
           -- Score based on buying intent keywords
           SUM(CASE 
             WHEN LOWER(m.content) ~ '\\y(buy|purchase|interested|take it|i''ll take|want to buy|how much|price|available|still selling|meet|pickup|deliver)\\y' 
             THEN 10 
             ELSE 0 
           END) as keyword_score,
           -- Score for product mentions (title or slug)
           SUM(CASE 
             WHEN LOWER(m.content) LIKE '%' || LOWER($2) || '%' 
               OR LOWER(m.content) LIKE '%' || LOWER($3) || '%'
             THEN 15 
             ELSE 0 
           END) as product_mention_score,
           -- Recent activity score
           SUM(CASE 
             WHEN m.created_at > NOW() - INTERVAL '7 days' THEN 5
             WHEN m.created_at > NOW() - INTERVAL '30 days' THEN 2
             ELSE 0
           END) as recency_score
         FROM chat_users cu
         LEFT JOIN messages m ON m.chat_id = cu.chat_id 
           AND m.created_at > NOW() - INTERVAL '60 days'
           AND m.is_deleted = FALSE
         GROUP BY cu.id, cu.username, cu.profile_picture, cu.full_name, cu.chat_id
       )
       SELECT 
         id,
         username,
         profile_picture,
         full_name,
         message_count,
         last_message_at,
         (keyword_score + product_mention_score + recency_score + 
          CASE WHEN message_count >= 3 THEN 5 ELSE 0 END) as engagement_score
       FROM message_analysis
       WHERE message_count > 0  -- At least 1 message exchanged
         AND last_message_at > NOW() - INTERVAL '60 days'  -- Active in last 60 days
       ORDER BY engagement_score DESC, last_message_at DESC
       LIMIT 20`,
      [sellerId, product.name, product.slug]
    );

    res.json({ buyers: result.rows });
  } catch (error) {
    console.error('Error fetching potential buyers:', error);
    res.status(500).json({ error: 'Failed to fetch potential buyers' });
  }
};

// Cancel transaction
exports.cancelTransaction = async (req, res) => {
  const userId = req.user.id;
  const { transactionId } = req.params;

  try {
    const transactionResult = await pool.query(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = transactionResult.rows[0];

    // Only seller or buyer can cancel, and only if not yet confirmed
    if (transaction.seller_id !== userId && transaction.buyer_id !== userId) {
      return res.status(403).json({ error: 'You are not part of this transaction' });
    }

    if (transaction.status === 'confirmed') {
      return res.status(400).json({ error: 'Cannot cancel a confirmed transaction' });
    }

    const result = await pool.query(
      `UPDATE transactions 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [transactionId]
    );

    res.json({
      message: 'Transaction cancelled',
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Error cancelling transaction:', error);
    res.status(500).json({ error: 'Failed to cancel transaction' });
  }
};
