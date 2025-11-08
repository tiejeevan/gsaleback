// controllers/usersController.js
const bcrypt = require('bcryptjs');
const userService = require('../services/userService');

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
    const user = await userService.getById(req.user.id);
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });
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
