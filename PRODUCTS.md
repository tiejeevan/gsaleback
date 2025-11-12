# PRODUCTS FEATURE DOCUMENTATION

> **IMPORTANT FOR KIRO AI**: This document tracks all product-related features, implementations, and changes. When implementing any product feature, you MUST update this document with:
> - Feature description and purpose
> - API endpoints created/modified
> - Database changes
> - Frontend components affected
> - Testing instructions
> - Date of implementation

---

## 📋 TABLE OF CONTENTS
1. [Database Schema](#database-schema)
2. [API Endpoints](#api-endpoints)
3. [Frontend Components](#frontend-components)
4. [Business Logic](#business-logic)
5. [Implementation Log](#implementation-log)

---

## 🗄️ DATABASE SCHEMA

### Tables Created
- ✅ **categories** - Product categories with nested support
- ✅ **products** - Main product information
- ✅ **product_attributes** - Product variants (color, size, etc.)
- ✅ **product_media** - Product images and videos

### 1. Categories Table
```sql
categories (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    description TEXT,
    image_url TEXT,
    parent_id UUID (self-referencing for nested categories),
    is_active BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```

**Purpose**: Organize products into hierarchical categories (e.g., Electronics → Phones → Smartphones)

**Indexes**:
- `idx_categories_slug` - Fast category lookup by URL slug
- `idx_categories_parent_id` - Efficient nested category queries
- `idx_categories_is_active` - Filter active categories

---

### 2. Products Table
```sql
products (
    id UUID PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE,
    description TEXT,
    short_description VARCHAR(1000),
    price DECIMAL(10, 2) NOT NULL,
    compare_at_price DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),
    category_id UUID FK → categories.id,
    brand VARCHAR(255),
    stock_quantity INTEGER,
    low_stock_threshold INTEGER,
    weight DECIMAL(10, 2),
    dimensions JSONB,
    images JSONB,
    video_url TEXT,
    tags JSONB,
    status ENUM('draft', 'pending', 'active', 'sold', 'archived'),
    is_featured BOOLEAN,
    is_verified BOOLEAN,
    owner_type ENUM('User', 'Store'),
    owner_id VARCHAR(255), -- Supports both integer user IDs and UUID store IDs
    rating_average DECIMAL(3, 2),
    rating_count INTEGER,
    views_count INTEGER,
    sales_count INTEGER,
    seo_title VARCHAR(255),
    seo_description TEXT,
    meta_keywords TEXT,
    created_by INTEGER FK → users.id,
    approved_by INTEGER FK → users.id,
    approved_at TIMESTAMP,
    deleted_at TIMESTAMP (soft delete),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```

**Key Features**:
- **Polymorphic Ownership**: Products can belong to Users or Stores via `owner_type` + `owner_id`
- **Soft Delete**: `deleted_at` allows recovery of deleted products
- **SEO Optimized**: Dedicated fields for search engine optimization
- **Inventory Tracking**: Stock quantity with low stock alerts
- **Status Workflow**: Draft → Pending → Active → Sold/Archived
- **Denormalized Metrics**: Rating, views, sales for performance

**Indexes**:
- `idx_products_slug` - SEO-friendly URLs
- `idx_products_category_id` - Category filtering
- `idx_products_status` - Status-based queries
- `idx_products_owner` - Owner-based product lists
- `idx_products_search` - Full-text search (GIN index)
- `idx_products_deleted_at` - Exclude soft-deleted products

---

### 3. Product Attributes Table
```sql
product_attributes (
    id UUID PRIMARY KEY,
    product_id UUID FK → products.id,
    key VARCHAR(100) (e.g., 'Color', 'Size'),
    value VARCHAR(255) (e.g., 'Red', 'XL'),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```

**Purpose**: Store product variants and custom attributes
- Color: Red, Blue, Green
- Size: S, M, L, XL
- Material: Cotton, Polyester
- Custom attributes per product

**Indexes**:
- `idx_product_attributes_product_id` - Fast attribute lookup
- `idx_product_attributes_key` - Filter by attribute type

---

### 4. Product Media Table
```sql
product_media (
    id UUID PRIMARY KEY,
    product_id UUID FK → products.id,
    type ENUM('image', 'video'),
    url TEXT NOT NULL,
    display_order INTEGER,
    is_primary BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```

**Purpose**: Manage multiple images and videos per product
- **display_order**: Control image sequence (0 = first)
- **is_primary**: Mark the main thumbnail image
- Supports both images and videos

**Indexes**:
- `idx_product_media_product_id` - Product media lookup
- `idx_product_media_is_primary` - Quick primary image fetch
- `idx_product_media_display_order` - Ordered media display

---

## 🚀 SETUP INSTRUCTIONS

### Database Setup

**Option 1: Using Node.js Script (Recommended)**
```bash
cd gsaleback
node scripts/create-products-tables.js
```

**Option 2: Using SQL File Directly**
```bash
psql $DATABASE_URL -f scripts/create-products-tables.sql
```

**Verify Installation**
```bash
node scripts/check-tables.js
```

---

## 📡 API ENDPOINTS

### Status: ✅ IMPLEMENTED

**Base URL**: `/api/products`

---

### Public Endpoints (No Auth Required)

#### `GET /api/products`
Get all products with filters and pagination

**Query Parameters**:
- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 20)
- `status` (string) - Filter by status: draft, pending, active, sold, archived
- `category_id` (uuid) - Filter by category
- `owner_type` (string) - Filter by owner type: User, Store
- `owner_id` (uuid) - Filter by owner ID
- `is_featured` (boolean) - Filter featured products
- `search` (string) - Full-text search in title and description
- `min_price` (number) - Minimum price filter
- `max_price` (number) - Maximum price filter
- `tags` (string) - Comma-separated tags
- `sort_by` (string) - Sort column: created_at, price, title, views_count, sales_count, rating_average
- `sort_order` (string) - ASC or DESC

**Response**:
```json
{
  "success": true,
  "products": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

#### `GET /api/products/:id`
Get single product with full details (attributes, media, category)

**Response**:
```json
{
  "success": true,
  "product": {
    "id": "uuid",
    "title": "Product Name",
    "price": 99.99,
    "attributes": [...],
    "media": [...],
    "category_name": "Electronics"
  }
}
```

---

#### `GET /api/products/search?q=query`
Search products by keyword

**Query Parameters**:
- `q` (string, required) - Search query
- All filter parameters from GET /api/products

---

#### `GET /api/products/featured?limit=10`
Get featured products

**Query Parameters**:
- `limit` (number) - Number of products (default: 10)

---

#### `GET /api/products/owner/:ownerType/:ownerId`
Get products by specific owner

**URL Parameters**:
- `ownerType` - User or Store
- `ownerId` - Owner's ID

---

### Authenticated Endpoints (Login Required)

#### `POST /api/products`
Create a new product

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "title": "Product Name",
  "slug": "product-name",
  "description": "Full description",
  "short_description": "Brief description",
  "price": 99.99,
  "compare_at_price": 129.99,
  "cost_price": 50.00,
  "sku": "PROD-001",
  "barcode": "123456789",
  "category_id": "uuid",
  "brand": "Brand Name",
  "stock_quantity": 100,
  "low_stock_threshold": 10,
  "weight": 1.5,
  "dimensions": {"length": 10, "width": 5, "height": 3},
  "video_url": "https://...",
  "tags": ["tag1", "tag2"],
  "status": "draft",
  "is_featured": false,
  "owner_type": "User",
  "seo_title": "SEO Title",
  "seo_description": "SEO Description",
  "meta_keywords": "keyword1, keyword2",
  "attributes": [
    {"key": "Color", "value": "Red"},
    {"key": "Size", "value": "Large"}
  ],
  "media": [
    {"type": "image", "url": "https://..."},
    {"type": "video", "url": "https://..."}
  ]
}
```

**Note**: `slug` is auto-generated from title if not provided

---

#### `GET /api/products/my`
Get current user's products

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**: Same as GET /api/products

---

#### `PUT /api/products/:id`
Update product (owner or admin only)

**Headers**: `Authorization: Bearer <token>`

**Body**: Same fields as POST (all optional)

---

#### `DELETE /api/products/:id`
Soft delete product (owner or admin only)

**Headers**: `Authorization: Bearer <token>`

---

#### `PATCH /api/products/:id/stock`
Update product stock quantity

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "quantity": 10,
  "operation": "set" // or "increment" or "decrement"
}
```

---

### Category Endpoints

#### `GET /api/products/categories`
Get all categories with product counts

**Query Parameters**:
- `include_inactive` (boolean) - Include inactive categories

---

#### `GET /api/products/categories/:id`
Get category with products

**Query Parameters**:
- `page` (number)
- `limit` (number)

---

#### `POST /api/products/categories` (Admin Only)
Create new category

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "name": "Category Name",
  "slug": "category-name",
  "description": "Category description",
  "image_url": "https://...",
  "parent_id": "uuid" // optional, for nested categories
}
```

---

#### `PUT /api/products/categories/:id` (Admin Only)
Update category

---

#### `DELETE /api/products/categories/:id` (Admin Only)
Delete category (fails if products exist)

---

### Admin Endpoints (Admin Role Required)

#### `GET /api/products/admin/stats`
Get product statistics

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "stats": {
    "total_products": 1000,
    "active_products": 800,
    "pending_products": 50,
    "draft_products": 100,
    "sold_products": 50,
    "deleted_products": 20,
    "featured_products": 30,
    "categories_used": 15,
    "average_price": 75.50,
    "total_stock": 5000,
    "total_views": 100000,
    "total_sales": 500
  }
}
```

---

#### `GET /api/products/admin/pending`
Get products awaiting approval

**Query Parameters**:
- `page` (number)
- `limit` (number)

---

#### `PUT /api/products/admin/:id/approve`
Approve pending product

**Headers**: `Authorization: Bearer <token>`

---

#### `PUT /api/products/admin/:id/reject`
Reject product (sets status to archived)

---

#### `PUT /api/products/admin/:id/restore`
Restore soft-deleted product

---

#### `DELETE /api/products/admin/:id/permanent`
Permanently delete product (cannot be undone)

---

## 🎨 FRONTEND COMPONENTS

### Admin Panel - Status: ✅ COMPLETE

**Implemented Components**:

#### Main Controller
- ✅ `AdminProductsController.tsx` - Main products control panel with tabs
  - Products listing with advanced filters
  - Pending approval queue
  - Category management
  - Real-time statistics dashboard

#### Product Management
- ✅ `ProductFormDialog.tsx` - Comprehensive product create/edit form
  - Basic information (title, description, slug)
  - Pricing (price, compare price, cost price)
  - Inventory (SKU, barcode, stock, threshold)
  - Organization (category, brand, tags)
  - Attributes (color, size, custom fields)
  - Media (images, videos)
  - Shipping (weight, dimensions)
  - SEO (title, description, keywords)
  - Featured toggle

- ✅ `ProductViewDialog.tsx` - Detailed product view
  - Full product information
  - Stats (views, sales, ratings)
  - Pricing breakdown with profit calculation
  - Attributes and media display
  - SEO information
  - Quick edit access

- ✅ `StockUpdateDialog.tsx` - Stock management
  - Set to specific quantity
  - Increment stock
  - Decrement stock
  - Real-time stock preview

#### Category Management
- ✅ `CategoryManagement.tsx` - Full category CRUD
  - Create/edit/delete categories
  - Nested categories support
  - Product count per category
  - Active/inactive toggle
  - Slug auto-generation

#### Services
- ✅ `productsService.ts` - TypeScript service layer
  - All API methods typed
  - Error handling
  - Token management

### User-Facing - Status: 🔴 NOT IMPLEMENTED

**Planned Components**:
- ⏳ Product listing page
- ⏳ Product detail page
- ⏳ Product search interface
- ⏳ Category browsing
- ⏳ Shopping cart (future)

---

## 💼 BUSINESS LOGIC

### Product Status Workflow
```
draft → pending → active → sold/archived
         ↓
      rejected
```

1. **Draft**: Product being created, not visible to public
2. **Pending**: Submitted for admin review
3. **Active**: Approved and visible to buyers
4. **Sold**: Product has been sold (for unique items)
5. **Archived**: Product no longer available

### Ownership Model
Products can be owned by:
- **User**: Individual sellers
- **Store**: Business entities (future feature)

### Inventory Management
- Track stock quantity
- Low stock alerts when quantity ≤ `low_stock_threshold`
- Automatic status change to "sold" when stock = 0 (optional)

### SEO Features
- Unique slugs for SEO-friendly URLs
- Meta titles and descriptions
- Keywords for search optimization
- Full-text search capability

---

## 📝 IMPLEMENTATION LOG

### 2024-11-11 - Database Schema Created
**Implemented by**: Kiro AI  
**Changes**:
- Created 4 database tables: categories, products, product_attributes, product_media
- Added comprehensive indexes for performance
- Implemented soft delete for products
- Added polymorphic ownership (User/Store)
- Created migration scripts (SQL + Node.js)
- Added sample categories for testing (Electronics, Clothing, Home & Garden)

**Files Created**:
- `gsaleback/scripts/create-products-tables.sql`
- `gsaleback/scripts/create-products-tables.js`
- `gsaleback/PRODUCTS.md` (this file)

**Database Tables**:
- ✅ categories (9 columns, 3 sample rows)
- ✅ products (32 columns with full-text search)
- ✅ product_attributes (4 columns)
- ✅ product_media (7 columns with display_order and is_primary)

**Database Fix**:
- Fixed `owner_id` column type from UUID to VARCHAR(255) to support polymorphic relationships (integer user IDs + UUID store IDs)

---

### 2024-11-11 - Backend API Implementation
**Implemented by**: Kiro AI  
**Changes**:
- Created complete products service with 30+ methods
- Implemented products controller with all CRUD operations
- Set up RESTful routes with proper authentication
- Added admin-only endpoints for product management
- Integrated routes into main server.js

**Files Created**:
- `gsaleback/services/productsService.js` (850+ lines)
- `gsaleback/controllers/productsController.js` (650+ lines)
- `gsaleback/routes/products.js` (90+ lines)

---

### 2024-11-11 - Frontend Admin UI Implementation
**Implemented by**: Kiro AI  
**Changes**:
- Created comprehensive admin products management UI
- Implemented all CRUD dialogs with full validation
- Added category management with nested support
- Built stock management system
- Integrated with backend API via TypeScript service

**Files Created**:
- `gsale/src/components/admin/AdminProductsController.tsx` (500+ lines)
- `gsale/src/components/admin/ProductFormDialog.tsx` (600+ lines)
- `gsale/src/components/admin/ProductViewDialog.tsx` (400+ lines)
- `gsale/src/components/admin/CategoryManagement.tsx` (400+ lines)
- `gsale/src/components/admin/StockUpdateDialog.tsx` (200+ lines)
- `gsale/src/services/productsService.ts` (300+ lines)

**Features Implemented**:

#### Product Operations
- ✅ Create product with attributes and media
- ✅ Get all products with advanced filtering
- ✅ Get single product with full relations
- ✅ Update product (owner/admin only)
- ✅ Soft delete product
- ✅ Search products (full-text + LIKE)
- ✅ Get featured products
- ✅ Get products by owner
- ✅ Update stock (set/increment/decrement)
- ✅ Auto-increment views on product view

#### Category Operations
- ✅ Create category (admin only)
- ✅ Get all categories with product counts
- ✅ Get category with products (paginated)
- ✅ Update category (admin only)
- ✅ Delete category (admin only, prevents deletion if products exist)
- ✅ Nested categories support (parent_id)

#### Admin Operations
- ✅ Get pending products for approval
- ✅ Approve product
- ✅ Reject product
- ✅ Restore soft-deleted product
- ✅ Permanently delete product
- ✅ Get comprehensive product statistics

#### Advanced Features
- ✅ Polymorphic ownership (User/Store)
- ✅ Full-text search with PostgreSQL
- ✅ Price range filtering
- ✅ Tag-based filtering
- ✅ Multiple sort options
- ✅ Pagination on all list endpoints
- ✅ Denormalized metrics (views, sales, ratings)
- ✅ Transaction support for data integrity
- ✅ Proper authorization checks

**API Endpoints**: 25+ endpoints documented above

**Next Steps**:
1. ✅ Database setup - COMPLETE
2. ✅ Backend API - COMPLETE
3. ⏳ Frontend admin UI for product management
4. ⏳ Frontend product listing and detail pages
5. ⏳ Image upload integration
6. ⏳ Product reviews and ratings
7. ⏳ Shopping cart functionality

---

## 🔧 TECHNICAL NOTES

### Database Considerations
- Using UUID for all primary keys (better for distributed systems)
- JSONB for flexible data (dimensions, images, tags)
- GIN indexes for full-text search
- Soft deletes preserve data integrity
- Triggers auto-update `updated_at` timestamps

### Performance Optimizations
- Denormalized rating/views/sales counts (avoid expensive aggregations)
- Strategic indexes on frequently queried columns
- Full-text search index for product search
- Composite index on owner_type + owner_id

### Security Considerations
- Products require authentication to create/edit
- Admin approval workflow for quality control
- Soft delete prevents accidental data loss
- Owner validation (users can only edit their own products)

---

## 📚 FUTURE ENHANCEMENTS

### Phase 2 (Planned)
- [ ] Product reviews and ratings system
- [ ] Product variants (size/color combinations with separate SKUs)
- [ ] Bulk product import/export
- [ ] Product analytics dashboard
- [ ] Image optimization and CDN integration

### Phase 3 (Future)
- [ ] Shopping cart and checkout
- [ ] Order management
- [ ] Payment integration
- [ ] Shipping calculations
- [ ] Multi-vendor marketplace features
- [ ] Product recommendations
- [ ] Wishlist functionality

---

## 🐛 KNOWN ISSUES

None yet - feature just created!

---

## 📞 SUPPORT

For questions or issues with the products feature:
1. Check this documentation first
2. Review the database schema in `create-products-tables.sql`
3. Check implementation log above for recent changes

---

---

## ✅ COMPLETION CHECKLIST

### Backend (Complete ✅)
- [x] Database schema designed
- [x] 4 tables created with indexes
- [x] Migration scripts created
- [x] Products service (30+ methods)
- [x] Products controller (25+ endpoints)
- [x] RESTful routes configured
- [x] Authentication & authorization
- [x] Admin-only endpoints
- [x] Full-text search
- [x] Pagination & filtering
- [x] Soft delete support
- [x] Transaction support
- [x] Polymorphic ownership
- [x] API documentation
- [x] Test scripts

### Frontend Admin (Complete ✅)
- [x] Admin products management UI
- [x] Product listing with filters
- [x] Product creation form (comprehensive)
- [x] Product edit form
- [x] Product view dialog
- [x] Category management (full CRUD)
- [x] Stock management dialog
- [x] Pending approval workflow
- [x] Statistics dashboard
- [x] Search & filters
- [x] Pagination
- [x] TypeScript service layer
- [x] Error handling
- [x] Success notifications

### Frontend User-Facing (Not Started)
- [ ] Product listing page
- [ ] Product detail page
- [ ] Product search interface
- [ ] Category browsing
- [ ] Image upload integration
- [ ] Shopping cart

### Future Features
- [ ] Product reviews & ratings
- [ ] Shopping cart
- [ ] Order management
- [ ] Payment integration
- [ ] Inventory alerts
- [ ] Product analytics
- [ ] Bulk import/export
- [ ] Multi-vendor features

---

## 🧪 TESTING

### Run API Tests
```bash
cd gsaleback
node scripts/test-products-api.js
```

This will verify:
- All database tables exist
- Sample categories are loaded
- Product creation works
- Database indexes are optimized
- Full-text search is configured

### Manual API Testing

**1. Get all products**:
```bash
curl http://localhost:5001/api/products
```

**2. Get categories**:
```bash
curl http://localhost:5001/api/products/categories
```

**3. Create a product** (requires authentication):
```bash
curl -X POST http://localhost:5001/api/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "iPhone 15 Pro",
    "description": "Latest iPhone model",
    "price": 999.99,
    "stock_quantity": 50,
    "category_id": "CATEGORY_UUID",
    "status": "active"
  }'
```

**4. Search products**:
```bash
curl "http://localhost:5001/api/products/search?q=iphone"
```

**5. Get product stats** (admin only):
```bash
curl http://localhost:5001/api/products/admin/stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

---

## 🧪 PRODUCTS TEST PAGE

A comprehensive test page has been created to test all admin product features:

**Access**: Navigate to `/admin/products-test` or click "🛍️ Products Test" button in Admin Dashboard

**Features**:
- Test all API endpoints with one click
- Individual test buttons for each feature
- Real-time console logging
- Error tracking and display
- Saves test product/category IDs for sequential testing

**Tests Included**:
1. Get Product Stats
2. Get All Products
3. Get Product By ID
4. Create Product
5. Update Product
6. Update Stock
7. Get Categories
8. Create Category
9. Search Products
10. Get Featured Products
11. Approve Product
12. Delete Product

---

**Last Updated**: 2024-11-11  
**Version**: 1.1.0 - Complete Backend + Admin UI + Test Suite
