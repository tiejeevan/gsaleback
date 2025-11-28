const pool = require('../db');

// Create a review
exports.createReview = async (req, res) => {
  const reviewerId = req.user.id;
  const { transactionId } = req.params;
  const {
    rating,
    reviewText,
    communicationRating,
    reliabilityRating,
    itemAsDescribedRating
  } = req.body;

  try {
    // Get transaction details
    const transactionResult = await pool.query(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = transactionResult.rows[0];

    // Verify transaction is confirmed
    if (transaction.status !== 'confirmed') {
      return res.status(400).json({ error: 'Can only review confirmed transactions' });
    }

    // Determine who is being reviewed and review type
    let reviewedUserId, reviewType;
    if (transaction.seller_id === reviewerId) {
      // Seller reviewing buyer
      reviewedUserId = transaction.buyer_id;
      reviewType = 'buyer';
    } else if (transaction.buyer_id === reviewerId) {
      // Buyer reviewing seller
      reviewedUserId = transaction.seller_id;
      reviewType = 'seller';
    } else {
      return res.status(403).json({ error: 'You are not part of this transaction' });
    }

    // Check if already reviewed
    const existingReview = await pool.query(
      'SELECT id FROM user_reviews WHERE transaction_id = $1 AND reviewer_id = $2',
      [transactionId, reviewerId]
    );

    if (existingReview.rows.length > 0) {
      return res.status(400).json({ error: 'You have already reviewed this transaction' });
    }

    // Create review
    const result = await pool.query(
      `INSERT INTO user_reviews 
       (transaction_id, reviewed_user_id, reviewer_id, review_type, rating, review_text,
        communication_rating, reliability_rating, item_as_described_rating,
        product_title, product_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        transactionId,
        reviewedUserId,
        reviewerId,
        reviewType,
        rating,
        reviewText,
        communicationRating,
        reliabilityRating,
        itemAsDescribedRating,
        transaction.product_title,
        transaction.product_image
      ]
    );

    res.status(201).json({
      message: 'Review submitted successfully',
      review: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
};

// Get reviews for a user
exports.getUserReviews = async (req, res) => {
  const { userId } = req.params;
  const { type, page = 1, limit = 10 } = req.query;

  try {
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT r.*, 
             reviewer.username as reviewer_username,
             reviewer.profile_picture as reviewer_profile_picture,
             reviewer.full_name as reviewer_full_name
      FROM user_reviews r
      LEFT JOIN users reviewer ON r.reviewer_id = reviewer.id
      WHERE r.reviewed_user_id = $1
    `;
    
    const params = [userId];
    
    if (type === 'seller' || type === 'buyer') {
      query += ` AND r.review_type = $${params.length + 1}`;
      params.push(type);
    }
    
    query += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM user_reviews WHERE reviewed_user_id = $1';
    const countParams = [userId];
    
    if (type === 'seller' || type === 'buyer') {
      countQuery += ' AND review_type = $2';
      countParams.push(type);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalReviews = parseInt(countResult.rows[0].count);

    res.json({
      reviews: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalReviews,
        totalPages: Math.ceil(totalReviews / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

// Get review stats for a user
exports.getUserReviewStats = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM user_review_stats WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Return default stats if none exist
      return res.json({
        stats: {
          user_id: userId,
          total_reviews_received: 0,
          average_rating: 0,
          seller_reviews_count: 0,
          seller_average_rating: 0,
          buyer_reviews_count: 0,
          buyer_average_rating: 0,
          total_sales_confirmed: 0,
          total_purchases_confirmed: 0
        }
      });
    }

    res.json({ stats: result.rows[0] });
  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({ error: 'Failed to fetch review stats' });
  }
};

// Add helpful vote to review
exports.addHelpfulVote = async (req, res) => {
  const userId = req.user.id;
  const { reviewId } = req.params;

  try {
    // Check if already voted
    const existingVote = await pool.query(
      'SELECT id FROM review_helpful_votes WHERE review_id = $1 AND user_id = $2',
      [reviewId, userId]
    );

    if (existingVote.rows.length > 0) {
      return res.status(400).json({ error: 'You have already marked this review as helpful' });
    }

    // Add vote
    await pool.query(
      'INSERT INTO review_helpful_votes (review_id, user_id) VALUES ($1, $2)',
      [reviewId, userId]
    );

    // Update helpful count
    await pool.query(
      'UPDATE user_reviews SET helpful_count = helpful_count + 1 WHERE id = $1',
      [reviewId]
    );

    res.json({ message: 'Review marked as helpful' });
  } catch (error) {
    console.error('Error adding helpful vote:', error);
    res.status(500).json({ error: 'Failed to add helpful vote' });
  }
};

// Remove helpful vote
exports.removeHelpfulVote = async (req, res) => {
  const userId = req.user.id;
  const { reviewId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM review_helpful_votes WHERE review_id = $1 AND user_id = $2 RETURNING *',
      [reviewId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vote not found' });
    }

    // Update helpful count
    await pool.query(
      'UPDATE user_reviews SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = $1',
      [reviewId]
    );

    res.json({ message: 'Helpful vote removed' });
  } catch (error) {
    console.error('Error removing helpful vote:', error);
    res.status(500).json({ error: 'Failed to remove helpful vote' });
  }
};

// Respond to a review (reviewed user can respond)
exports.respondToReview = async (req, res) => {
  const userId = req.user.id;
  const { reviewId } = req.params;
  const { responseText } = req.body;

  try {
    // Get review
    const reviewResult = await pool.query(
      'SELECT * FROM user_reviews WHERE id = $1',
      [reviewId]
    );

    if (reviewResult.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const review = reviewResult.rows[0];

    // Verify user is the one being reviewed
    if (review.reviewed_user_id !== userId) {
      return res.status(403).json({ error: 'You can only respond to reviews about you' });
    }

    // Update review with response
    const result = await pool.query(
      `UPDATE user_reviews 
       SET response_text = $1, response_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [responseText, reviewId]
    );

    res.json({
      message: 'Response added successfully',
      review: result.rows[0]
    });
  } catch (error) {
    console.error('Error responding to review:', error);
    res.status(500).json({ error: 'Failed to respond to review' });
  }
};
