// services/userService.js
const pool = require('../db');

// 🟢 Public view (safe fields) - supports both ID and username
exports.getPublicProfile = async (identifier) => {
  // Check if identifier is numeric (ID) or string (username)
  const isNumeric = !isNaN(identifier) && !isNaN(parseFloat(identifier));
  
  const query = isNumeric
    ? `SELECT id, username, display_name, profile_image, cover_image, about, bio,
              location, website, social_links, created_at, follower_count, following_count
       FROM users
       WHERE id = $1 AND is_active = true AND deleted_at IS NULL`
    : `SELECT id, username, display_name, profile_image, cover_image, about, bio,
              location, website, social_links, created_at, follower_count, following_count
       FROM users
       WHERE username = $1 AND is_active = true AND deleted_at IS NULL`;
  
  const { rows } = await pool.query(query, [identifier]);
  return rows[0];
};

// 🟢 Private view (all fields)
exports.getById = async (id) => {
  const { rows } = await pool.query(
    `SELECT id, email, username, display_name, first_name, last_name, bio, about,
            profile_image, cover_image, location, website, preferences, social_links,
            phone, role, is_verified, created_at, updated_at, last_login_at,
            follower_count, following_count, status,
            country, country_name, region, city, timezone, latitude, longitude,
            location_last_updated
     FROM users WHERE id = $1`,
    [id]
  );
  // Ensure role defaults to 'user' if not set
  const user = rows[0];
  if (user && !user.role) {
    user.role = 'user';
  }
  return user;
};

// 🟢 Dynamic update helper
exports.update = async (id, data) => {
  const keys = Object.keys(data);
  if (!keys.length) return null;

  const setClauses = keys.map((key, idx) => `${key} = $${idx + 1}`);
  const values = Object.values(data);

  const { rows } = await pool.query(
    `UPDATE users
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${keys.length + 1}
     RETURNING *`,
    [...values, id]
  );

  return rows[0];
};

// 🟢 Search users for mentions (autocomplete)
exports.searchForMentions = async (query, currentUserId, limit = 10) => {
  const Fuse = require('fuse.js');
  
  // Get all active users except current user
  const { rows } = await pool.query(
    `SELECT id, username, display_name, profile_image, first_name, last_name, follower_count
     FROM users
     WHERE is_active = true 
       AND deleted_at IS NULL
       AND id != $1`,
    [currentUserId]
  );

  // Configure Fuse.js for fuzzy search (more strict for mentions)
  const fuse = new Fuse(rows, {
    keys: [
      { name: 'username', weight: 2.5 },
      { name: 'display_name', weight: 2 },
      { name: 'first_name', weight: 1.5 },
      { name: 'last_name', weight: 1.5 }
    ],
    threshold: 0.3,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });

  // Perform fuzzy search
  const results = fuse.search(query);
  
  // Return top results
  return results.slice(0, limit).map(result => result.item);
};

// 🟢 Search active users (general search)
exports.searchActiveUsers = async (query, currentUserId, limit = 20) => {
  const Fuse = require('fuse.js');
  
  // Get all active users except current user
  const { rows } = await pool.query(
    `SELECT id, username, display_name, profile_image, first_name, last_name, bio, follower_count
     FROM users
     WHERE is_active = true 
       AND deleted_at IS NULL
       AND id != $1`,
    [currentUserId]
  );

  // Configure Fuse.js for fuzzy search
  const fuse = new Fuse(rows, {
    keys: [
      { name: 'username', weight: 2 },
      { name: 'display_name', weight: 1.8 },
      { name: 'first_name', weight: 1.5 },
      { name: 'last_name', weight: 1.5 },
      { name: 'bio', weight: 0.5 }
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  // Perform fuzzy search
  const results = fuse.search(query);
  
  // Return top results with score
  return results.slice(0, limit).map(result => ({
    ...result.item,
    searchScore: result.score
  }));
};

// 🟢 Get user search suggestions (typeahead)
exports.getUserSuggestions = async (query, currentUserId, limit = 5) => {
  const Fuse = require('fuse.js');
  
  // Get all active users except current user
  const { rows } = await pool.query(
    `SELECT id, username, display_name, profile_image, first_name, last_name, follower_count
     FROM users
     WHERE is_active = true 
       AND deleted_at IS NULL
       AND id != $1`,
    [currentUserId]
  );

  // Configure Fuse.js for fuzzy search
  const fuse = new Fuse(rows, {
    keys: [
      { name: 'username', weight: 2 },
      { name: 'display_name', weight: 1.8 },
      { name: 'first_name', weight: 1.5 },
      { name: 'last_name', weight: 1.5 }
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  // Perform fuzzy search
  const results = fuse.search(query);
  
  // Get total count
  const count = results.length;
  
  // Return limited suggestions with count
  return {
    suggestions: results.slice(0, limit).map(result => result.item),
    count
  };
};
