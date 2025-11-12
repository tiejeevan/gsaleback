# 🛒 CART & CHECKOUT SYSTEM DOCUMENTATION

## 📊 Current Status

### ✅ READY
- **Products System**: Fully implemented with 25+ API endpoints
- **Database Schema**: Cart and order tables SQL created
- **User Authentication**: Working JWT authentication system
- **Cart Backend Service**: Complete with validation and stock management
- **Order Backend Service**: Full order lifecycle management
- **Cart API Endpoints**: 8 endpoints implemented
- **Checkout API Endpoints**: 11 endpoints implemented (6 user + 5 admin)

### ⏳ TO BE IMPLEMENTED
- Frontend cart UI
- Frontend checkout flow
- Payment integration (Stripe/PayPal)

---

## 🗄️ DATABASE SCHEMA

### Tables Created (Run script to create)

```bash
# Create cart and order tables
node gsaleback/scripts/create-cart-order-tables.js
```

#### 1. **carts** Table
Stores user shopping carts (one active cart per user)

```sql
- id (UUID, PK)
- user_id (INTEGER, FK → users.id)
- session_id (VARCHAR) -- For guest carts
- status (active, abandoned, converted)
- total_amount (DECIMAL)
- total_items (INTEGER)
- expires_at (TIMESTAMP)
- created_at, updated_at
```

**Features**:
- One active cart per user (UNIQUE constraint)
- Auto-calculates totals via triggers
- Supports guest carts via session_id
- Tracks abandoned carts

#### 2. **cart_items** Table
Individual items in shopping carts

```sql
- id (UUID, PK)
- cart_id (UUID, FK → carts.id)
- product_id (UUID, FK → products.id)
- quantity (INTEGER)
- price (DECIMAL) -- Price at time of adding
- subtotal (DECIMAL) -- quantity * price
- selected_attributes (JSONB) -- Variants (color, size, etc.)
- created_at, updated_at
```

**Features**:
- One entry per product per cart
- Stores price snapshot
- Supports product variants
- Auto-updates cart totals on change

#### 3. **orders** Table
Customer orders after checkout

```sql
- id (UUID, PK)
- order_number (VARCHAR, UNIQUE) -- ORD-20241112-0001
- user_id (INTEGER, FK → users.id)
- status (pending, confirmed, processing, shipped, delivered, cancelled, refunded, failed)
- payment_status (pending, paid, failed, refunded, partially_refunded)
- subtotal, tax_amount, shipping_amount, discount_amount, total_amount
- shipping_address (JSONB)
- billing_address (JSONB)
- shipping_method, tracking_number
- payment_method, payment_transaction_id
- customer_notes, admin_notes
- confirmed_at, shipped_at, delivered_at, cancelled_at
- created_at, updated_at
```

**Features**:
- Auto-generated order numbers (ORD-YYYYMMDD-####)
- Complete order lifecycle tracking
- Flexible address storage (JSONB)
- Payment integration ready
- Admin notes for internal use

#### 4. **order_items** Table
Products in each order (snapshot at purchase time)

```sql
- id (UUID, PK)
- order_id (UUID, FK → orders.id)
- product_id (UUID, FK → products.id)
- product_title, product_slug, product_sku, product_image
- quantity, unit_price, subtotal
- selected_attributes (JSONB)
- created_at, updated_at
```

**Features**:
- Stores product snapshot (title, price, etc.)
- Preserves data even if product deleted
- Tracks selected variants

#### 5. **order_status_history** Table
Audit trail for order status changes

```sql
- id (UUID, PK)
- order_id (UUID, FK → orders.id)
- old_status, new_status
- changed_by (INTEGER, FK → users.id)
- notes (TEXT)
- created_at
```

**Features**:
- Complete audit trail
- Tracks who made changes
- Optional notes for each change

---

## 🚀 BACKEND IMPLEMENTATION PLAN

### Phase 1: Cart Service (cartService.js)

```javascript
// Required Methods:
- getOrCreateCart(userId) // Get user's active cart or create new
- addToCart(userId, productId, quantity, attributes)
- updateCartItem(userId, cartItemId, quantity)
- removeFromCart(userId, cartItemId)
- clearCart(userId)
- getCartWithItems(userId) // Cart + items + product details
- validateCart(userId) // Check stock availability, prices
- convertCartToOrder(userId, orderData) // Checkout
```

### Phase 2: Order Service (orderService.js)

```javascript
// Required Methods:
- createOrder(userId, cartId, orderData)
- getOrderById(orderId)
- getUserOrders(userId, filters)
- updateOrderStatus(orderId, newStatus, userId, notes)
- cancelOrder(orderId, userId)
- getOrderItems(orderId)
- calculateOrderTotals(cartItems, shippingMethod)
- generateOrderNumber()
// Admin methods:
- getAllOrders(filters, pagination)
- updateShippingInfo(orderId, trackingNumber, shippingMethod)
- refundOrder(orderId, amount, reason)
```

### Phase 3: API Endpoints

#### Cart Endpoints
```
POST   /api/cart/add              - Add item to cart
GET    /api/cart                  - Get user's cart
PUT    /api/cart/item/:id         - Update cart item quantity
DELETE /api/cart/item/:id         - Remove item from cart
DELETE /api/cart                  - Clear entire cart
POST   /api/cart/validate         - Validate cart before checkout
```

#### Order Endpoints
```
POST   /api/orders/checkout       - Create order from cart
GET    /api/orders                - Get user's orders
GET    /api/orders/:id            - Get order details
PUT    /api/orders/:id/cancel     - Cancel order
GET    /api/orders/:id/track      - Track order status

// Admin endpoints
GET    /api/admin/orders          - Get all orders (filtered)
PUT    /api/admin/orders/:id/status - Update order status
PUT    /api/admin/orders/:id/shipping - Update shipping info
POST   /api/admin/orders/:id/refund - Process refund
```

---

## 🎨 FRONTEND IMPLEMENTATION PLAN

### Phase 1: Cart Context & State Management

```typescript
// src/context/CartContext.tsx
interface CartContextType {
  cart: Cart | null;
  cartItems: CartItem[];
  itemCount: number;
  totalAmount: number;
  loading: boolean;
  addToCart: (productId: string, quantity: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}
```

### Phase 2: Cart Components

#### 1. **CartIcon** (Navbar)
- Shows cart item count badge
- Opens cart drawer on click

#### 2. **CartDrawer** (Slide-out panel)
- List of cart items
- Quantity controls (+/-)
- Remove item button
- Subtotal display
- "Checkout" button
- "Continue Shopping" button

#### 3. **CartPage** (Full page view)
- Detailed cart items table
- Product images and details
- Quantity controls
- Price breakdown
- Promo code input
- Proceed to checkout button

### Phase 3: Checkout Flow

#### 1. **CheckoutPage**
Multi-step checkout:
- Step 1: Shipping Address
- Step 2: Shipping Method
- Step 3: Payment Method
- Step 4: Review & Confirm

#### 2. **OrderConfirmationPage**
- Order number
- Order summary
- Estimated delivery
- Tracking link (if available)

#### 3. **OrdersPage** (User's order history)
- List of past orders
- Order status
- View details button
- Reorder button
- Track order button

### Phase 4: Product Page Integration

Add to cart functionality on:
- MarketPage (product cards)
- ProductDetailPage (main CTA)
- Quick add buttons

---

## 💳 PAYMENT INTEGRATION OPTIONS

### Recommended: Stripe
```javascript
// Install
npm install stripe @stripe/stripe-js @stripe/react-stripe-js

// Backend
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create payment intent
const paymentIntent = await stripe.paymentIntents.create({
  amount: totalAmount * 100, // cents
  currency: 'usd',
  metadata: { orderId: order.id }
});

// Frontend
import { Elements, CardElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY);
```

### Alternative: PayPal
```javascript
npm install @paypal/react-paypal-js
```

---

## 🔧 IMPLEMENTATION STEPS

### Step 1: Database Setup ✅
```bash
node gsaleback/scripts/create-cart-order-tables.js
```

### Step 2: Backend Services ✅
1. ✅ Created `gsaleback/services/cartService.js`
2. ✅ Created `gsaleback/services/orderService.js`
3. ✅ Created `gsaleback/controllers/cartController.js`
4. ✅ Created `gsaleback/controllers/orderController.js`
5. ✅ Created `gsaleback/routes/cart.js`
6. ✅ Created `gsaleback/routes/orders.js`
7. ✅ Added routes to `server.js`

### Step 3: Frontend Services
1. Create `gsale/src/services/cartService.ts`
2. Create `gsale/src/services/orderService.ts`
3. Create `gsale/src/context/CartContext.tsx`

### Step 4: Frontend Components
1. Create cart components
2. Create checkout components
3. Create order history components
4. Add cart icon to navbar
5. Integrate with product pages

### Step 5: Testing
1. Test cart operations
2. Test checkout flow
3. Test order management
4. Test payment integration

---

## 📋 FEATURES CHECKLIST

### Cart Features
- [ ] Add to cart
- [ ] Update quantity
- [ ] Remove from cart
- [ ] Clear cart
- [ ] Cart persistence (database)
- [ ] Cart item count badge
- [ ] Cart drawer/modal
- [ ] Cart page
- [ ] Stock validation
- [ ] Price updates
- [ ] Product variants support

### Checkout Features
- [ ] Shipping address form
- [ ] Billing address (optional)
- [ ] Shipping method selection
- [ ] Tax calculation
- [ ] Discount/promo codes
- [ ] Order summary
- [ ] Payment integration
- [ ] Order confirmation
- [ ] Email notifications

### Order Management
- [ ] Order history page
- [ ] Order details page
- [ ] Order status tracking
- [ ] Cancel order
- [ ] Reorder functionality
- [ ] Download invoice
- [ ] Admin order management
- [ ] Order status updates
- [ ] Shipping tracking

---

## 🎯 QUICK START GUIDE

### For Developers

1. **Create Database Tables**:
   ```bash
   node gsaleback/scripts/create-cart-order-tables.js
   ```

2. **Implement Backend** (Priority Order):
   - Cart service → Cart controller → Cart routes
   - Order service → Order controller → Order routes
   - Test with Postman/curl

3. **Implement Frontend** (Priority Order):
   - Cart context & services
   - Cart icon & drawer
   - Add to cart buttons
   - Checkout flow
   - Order history

4. **Payment Integration**:
   - Sign up for Stripe/PayPal
   - Add API keys to .env
   - Implement payment flow
   - Test with test cards

---

## 🔐 SECURITY CONSIDERATIONS

1. **Cart Validation**:
   - Always validate stock availability
   - Check product prices on server
   - Prevent negative quantities
   - Validate product exists and is active

2. **Order Security**:
   - Verify user owns the cart
   - Validate payment before order creation
   - Use transactions for order creation
   - Log all order status changes

3. **Payment Security**:
   - Never store credit card details
   - Use PCI-compliant payment processors
   - Validate payment on server
   - Handle payment failures gracefully

---

## 📊 ANALYTICS & METRICS

Track these metrics:
- Cart abandonment rate
- Average order value
- Conversion rate
- Popular products
- Revenue by category
- Order fulfillment time
- Customer lifetime value

---

## 🚀 FUTURE ENHANCEMENTS

### Phase 2
- [ ] Wishlist functionality
- [ ] Product reviews after purchase
- [ ] Order ratings
- [ ] Saved addresses
- [ ] Multiple payment methods
- [ ] Gift cards/store credit

### Phase 3
- [ ] Subscription products
- [ ] Pre-orders
- [ ] Backorders
- [ ] Multi-vendor orders
- [ ] Split payments
- [ ] International shipping
- [ ] Currency conversion

---

## 📞 SUPPORT

For implementation help:
1. Check this documentation
2. Review database schema in `create-cart-order-tables.sql`
3. Follow implementation steps above
4. Test each component individually

---

**Last Updated**: 2024-11-12  
**Version**: 1.0.0 - Database Schema Ready, Implementation Pending


---

## 🎉 BACKEND IMPLEMENTATION COMPLETE

### Implementation Date: 2024-11-12

### ✅ What Was Implemented

#### 1. Cart Service (`services/cartService.js`)
Complete cart management with the following methods:
- `getOrCreateCart(userId)` - Get or create user's active cart
- `getCartWithItems(userId)` - Get cart with full product details
- `addToCart(userId, productId, quantity, attributes)` - Add items with validation
- `updateCartItem(userId, cartItemId, quantity)` - Update quantities
- `removeFromCart(userId, cartItemId)` - Remove items
- `clearCart(userId)` - Clear entire cart
- `validateCart(userId)` - Validate stock and prices before checkout
- `updateCartPrices(userId)` - Sync cart prices with current product prices
- `convertCart(cartId)` - Mark cart as converted after order
- `getCartItemCount(userId)` - Get total item count

**Features**:
- Automatic stock validation
- Price snapshot at time of adding
- Product availability checks
- Attribute support for variants
- Real-time cart totals via database triggers

#### 2. Order Service (`services/orderService.js`)
Complete order lifecycle management:
- `createOrder(userId, orderData)` - Create order from cart with full validation
- `getOrderById(orderId, userId)` - Get order with items and history
- `getUserOrders(userId, filters)` - Get user's orders with pagination
- `updateOrderStatus(orderId, status, userId, notes)` - Update order status
- `cancelOrder(orderId, userId, reason)` - Cancel order and restore stock
- `addStatusHistory(orderId, oldStatus, newStatus, userId, notes)` - Audit trail
- `getAllOrders(filters)` - Admin: Get all orders with filters
- `updateShippingInfo(orderId, trackingNumber, shippingMethod)` - Admin: Update shipping
- `refundOrder(orderId, amount, reason, userId)` - Admin: Process refunds
- `getOrderStats()` - Admin: Get comprehensive statistics

**Features**:
- Auto-generated order numbers (ORD-YYYYMMDD-####)
- Complete status workflow tracking
- Automatic stock management
- Order status history audit trail
- Tax and shipping calculations
- Refund processing with stock restoration
- Transaction safety for data integrity

#### 3. Cart Controller (`controllers/cartController.js`)
8 API endpoints for cart operations:
- `GET /api/cart` - Get user's cart
- `GET /api/cart/count` - Get cart item count
- `POST /api/cart/add` - Add item to cart
- `PUT /api/cart/item/:id` - Update cart item
- `DELETE /api/cart/item/:id` - Remove item
- `DELETE /api/cart` - Clear cart
- `POST /api/cart/validate` - Validate cart
- `POST /api/cart/update-prices` - Update prices

#### 4. Order Controller (`controllers/orderController.js`)
11 API endpoints (6 user + 5 admin):

**User Endpoints**:
- `POST /api/orders/checkout` - Create order from cart
- `GET /api/orders` - Get user's orders
- `GET /api/orders/:id` - Get order details
- `GET /api/orders/:id/track` - Track order
- `PUT /api/orders/:id/cancel` - Cancel order

**Admin Endpoints**:
- `GET /api/orders/admin/stats` - Get order statistics
- `GET /api/orders/admin/all` - Get all orders
- `GET /api/orders/admin/:id` - Get any order
- `PUT /api/orders/admin/:id/status` - Update order status
- `PUT /api/orders/admin/:id/shipping` - Update shipping info
- `POST /api/orders/admin/:id/refund` - Process refund

#### 5. Routes Configuration
- `routes/cart.js` - Cart routes with authentication
- `routes/orders.js` - Order routes with authentication and admin checks
- Updated `server.js` to include new routes

#### 6. Test Suite
Created `test-cart-order-api.js` - Comprehensive test script covering:
- Authentication
- Cart operations (add, update, remove, validate)
- Checkout process
- Order retrieval and tracking
- Admin operations
- Error handling

### 🔒 Security Features Implemented

1. **Authentication Required**: All endpoints require valid JWT token
2. **Authorization Checks**: Users can only access their own carts and orders
3. **Admin Protection**: Admin endpoints require admin role
4. **Stock Validation**: Prevents overselling
5. **Price Validation**: Validates prices at checkout
6. **Transaction Safety**: Uses database transactions for data integrity
7. **Ownership Verification**: Verifies user owns cart/order before operations

### 🚀 Future-Proofing Features

1. **Polymorphic Product Ownership**: Supports both User and Store owners
2. **Flexible Attributes**: JSONB fields for product variants
3. **Extensible Status System**: Easy to add new order statuses
4. **Audit Trail**: Complete order status history
5. **Soft Deletes**: Cart conversion preserves data
6. **Scalable Architecture**: Service layer pattern for easy testing
7. **Payment Integration Ready**: Payment method and transaction ID fields
8. **Multi-currency Ready**: Decimal precision for international currencies
9. **Shipping Integration Ready**: Tracking number and shipping method fields
10. **Discount System Ready**: Discount amount field in orders

### 📊 Database Optimizations

1. **Automatic Triggers**: Cart totals update automatically
2. **Indexed Queries**: All foreign keys and frequently queried fields indexed
3. **Efficient Joins**: Optimized queries with proper joins
4. **Denormalized Data**: Order items store product snapshots
5. **Unique Constraints**: Prevents duplicate cart items

### 🧪 Testing Instructions

1. **Run the test suite**:
   ```bash
   cd gsaleback
   node test-cart-order-api.js
   ```

2. **Manual testing with curl**:
   ```bash
   # Login
   TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"password123"}' \
     | jq -r '.token')

   # Add to cart
   curl -X POST http://localhost:5000/api/cart/add \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"product_id":"PRODUCT_UUID","quantity":2}'

   # Get cart
   curl http://localhost:5000/api/cart \
     -H "Authorization: Bearer $TOKEN"

   # Checkout
   curl -X POST http://localhost:5000/api/orders/checkout \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "shipping_address": {
         "name": "John Doe",
         "address": "123 Main St",
         "city": "New York",
         "state": "NY",
         "zip": "10001",
         "country": "USA",
         "phone": "555-1234"
       },
       "payment_method": "credit_card",
       "shipping_method": "standard"
     }'
   ```

### 📝 Next Steps for Frontend

1. **Create Cart Context** (`src/context/CartContext.tsx`)
2. **Create Cart Service** (`src/services/cartService.ts`)
3. **Create Order Service** (`src/services/orderService.ts`)
4. **Build Cart Components**:
   - CartIcon with badge
   - CartDrawer (slide-out)
   - CartPage (full page)
5. **Build Checkout Flow**:
   - Shipping address form
   - Payment method selection
   - Order review
   - Order confirmation
6. **Build Order Management**:
   - Order history page
   - Order details page
   - Order tracking page
7. **Integrate Payment**:
   - Stripe or PayPal integration
   - Payment processing
   - Payment confirmation

### 🎯 API Endpoints Summary

**Cart Endpoints** (8 total):
```
GET    /api/cart              - Get cart
GET    /api/cart/count        - Get item count
POST   /api/cart/add          - Add item
PUT    /api/cart/item/:id     - Update item
DELETE /api/cart/item/:id     - Remove item
DELETE /api/cart              - Clear cart
POST   /api/cart/validate     - Validate cart
POST   /api/cart/update-prices - Update prices
```

**Order Endpoints** (11 total):
```
User Endpoints:
POST   /api/orders/checkout   - Create order
GET    /api/orders            - Get user orders
GET    /api/orders/:id        - Get order details
GET    /api/orders/:id/track  - Track order
PUT    /api/orders/:id/cancel - Cancel order

Admin Endpoints:
GET    /api/orders/admin/stats      - Get statistics
GET    /api/orders/admin/all        - Get all orders
GET    /api/orders/admin/:id        - Get any order
PUT    /api/orders/admin/:id/status - Update status
PUT    /api/orders/admin/:id/shipping - Update shipping
POST   /api/orders/admin/:id/refund - Process refund
```

### 📦 Files Created

```
gsaleback/
├── services/
│   ├── cartService.js          (350+ lines)
│   └── orderService.js         (550+ lines)
├── controllers/
│   ├── cartController.js       (200+ lines)
│   └── orderController.js      (350+ lines)
├── routes/
│   ├── cart.js                 (20 lines)
│   └── orders.js               (25 lines)
├── test-cart-order-api.js      (300+ lines)
└── server.js                   (updated)
```

**Total Lines of Code**: ~1,800+ lines of production-ready backend code

---

**Status**: ✅ BACKEND COMPLETE - Ready for frontend integration  
**Last Updated**: 2024-11-12  
**Version**: 2.0.0 - Full Backend Implementation
