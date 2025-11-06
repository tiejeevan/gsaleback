// services/userService.js
const pool = require('../db');

// 🟢 Public view (safe fields)
exports.getPublicProfile = async (id) => {
  const { rows } = await pool.query(
    `SELECT id, username, display_name, profile_image, cover_image, about, bio,
            location, website, social_links, created_at
     FROM users
     WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
    [id]
  );
  return rows[0];
};

// 🟢 Private view (all fields)
exports.getById = async (id) => {
  const { rows } = await pool.query(
    `SELECT id, email, username, display_name, first_name, last_name, bio, about,
            profile_image, cover_image, location, website, preferences, social_links,
            phone, role, is_verified, created_at, updated_at, last_login_at
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
