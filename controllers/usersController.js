// controllers/usersController.js
const bcrypt = require('bcryptjs');
const userService = require('../services/userService');
const locationService = require('../services/locationService');
const externalLocationService = require('../services/externalLocationService');

// ✅ 1. Public profile by ID (viewable by others)
exports.getPublicProfile = async (req, res) => {
  try {
    const user = await userService.getPublicProfile(req.params.id);
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ 2. Get own profile (private info)
exports.getMe = async (req, res) => {
  try {
    // Get client IP address
    const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    console.log('🔍 Detected IP address:', ip);

    // First, fetch current user to check if location needs updating
    let user = await userService.getById(req.user.id);
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    // Check if we need to update location:
    // 1. No location data exists (city is null)
    // 2. Location is older than 24 hours
    // 3. IP address changed
    const needsUpdate = !user.city ||
      !user.location_last_updated ||
      (new Date() - new Date(user.location_last_updated)) > 24 * 60 * 60 * 1000 ||
      user.ip_address !== ip;

    if (needsUpdate) {
      console.log('🔄 Location needs update (missing, old, or IP changed)');
      try {
        const locationData = await externalLocationService.getLocationWithFallback(ip);
        console.log('📍 Location data:', locationData);

        // Update database
        const query = `
          UPDATE users 
          SET 
            ip_address = $1,
            country = $2,
            country_name = $3,
            region = $4,
            city = $5,
            timezone = $6,
            latitude = $7,
            longitude = $8,
            location_last_updated = NOW()
          WHERE id = $9
        `;

        const pool = require('../db');
        await pool.query(query, [
          ip,
          locationData.country,
          locationData.country_name,
          locationData.region,
          locationData.city,
          locationData.timezone,
          locationData.latitude,
          locationData.longitude,
          req.user.id
        ]);

        console.log('✅ Location updated successfully');

        // Fetch user again with updated location
        user = await userService.getById(req.user.id);
      } catch (err) {
        console.error('❌ Error updating location:', err);
        // Continue with existing location data
      }
    } else {
      console.log('✓ Using cached location (updated recently)');
    }

    // Add currency and language info based on country
    if (user.country) {
      const completeLocation = locationService.getCompleteLocationInfo(user.country, {
        country: user.country,
        country_name: user.country_name,
        region: user.region,
        city: user.city,
        timezone: user.timezone,
        latitude: user.latitude,
        longitude: user.longitude,
        location_last_updated: user.location_last_updated
      });
      user.location_info = completeLocation;
    }

    // Fetch unread counts for notifications and messages (optimization to reduce initial API calls)
    const pool = require('../db');

    try {
      // Get unread notifications count
      const notificationsResult = await pool.query(
        `SELECT COUNT(*) as count FROM notifications 
         WHERE recipient_user_id = $1 AND read = false`,
        [req.user.id]
      );
      user.unread_notifications_count = parseInt(notificationsResult.rows[0].count) || 0;

      // Get unread messages count (sum of all chat unread counts)
      const messagesResult = await pool.query(
        `SELECT COALESCE(SUM(unread_count), 0) as count FROM user_chat_list 
         WHERE user_id = $1 AND hidden = FALSE`,
        [req.user.id]
      );
      user.unread_messages_count = parseInt(messagesResult.rows[0].count) || 0;
    } catch (countErr) {
      console.error('Error fetching unread counts:', countErr);
      // Default to 0 if there's an error (don't fail the whole request)
      user.unread_notifications_count = 0;
      user.unread_messages_count = 0;
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('Error fetching self:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ 3. Update own profile (bio, images, etc.)
exports.updateMe = async (req, res) => {
  try {
    const updatedUser = await userService.update(req.user.id, req.body);
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
};

// ✅ 4. Change password
exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword)
    return res.status(400).json({ success: false, message: 'Both passwords required' });

  try {
    const user = await userService.getById(req.user.id);
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Old password incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await userService.update(req.user.id, { password: hashed });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ 5. Deactivate account (soft delete)
exports.deactivateMe = async (req, res) => {
  try {
    const updated = await userService.update(req.user.id, {
      is_active: false,
      deleted_at: new Date(),
    });
    res.json({ success: true, message: 'Account deactivated', user: updated });
  } catch (err) {
    console.error('Error deactivating user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ 6. Search users for mentions (autocomplete)
exports.searchUsersForMentions = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 1) {
      return res.json({ success: true, users: [] });
    }

    const users = await userService.searchForMentions(q.trim(), req.user.id);
    res.json({ success: true, users });
  } catch (err) {
    console.error('Error searching users for mentions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ 7. Search active users (general search with min 2 chars)
exports.searchActiveUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ success: true, users: [] });
    }

    const users = await userService.searchActiveUsers(q.trim(), req.user.id);
    res.json({ success: true, users });
  } catch (err) {
    console.error('Error searching active users:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ 8. Get user search suggestions (typeahead)
exports.getUserSuggestions = async (req, res) => {
  try {
    const { q, limit } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ success: true, suggestions: [], count: 0 });
    }

    const result = await userService.getUserSuggestions(
      q.trim(),
      req.user.id,
      limit ? parseInt(limit) : 5
    );

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error getting user suggestions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
