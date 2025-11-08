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
            follower_count, following_count
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0];
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
  const { rows } = await pool.query(
    `SELECT id, username, display_name, profile_image, first_name, last_name
     FROM users
     WHERE (username ILIKE $1 OR display_name ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)
       AND is_active = true 
       AND deleted_at IS NULL
       AND id != $2
     ORDER BY 
       CASE 
         WHEN username ILIKE $1 THEN 1
         WHEN display_name ILIKE $1 THEN 2
         ELSE 3
       END,
       follower_count DESC NULLS LAST
     LIMIT $3`,
    [`${query}%`, currentUserId, limit]
  );
  return rows;
};
