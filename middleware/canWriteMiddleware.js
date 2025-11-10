// middleware/canWriteMiddleware.js
// Middleware to check if user can perform write actions (create/update/delete)
// Muted users can read but cannot write

module.exports = (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if user is muted
  if (user.status === 'muted') {
    return res.status(403).json({ 
      error: 'Account muted',
      message: 'Your account has been muted. You can view content but cannot post, comment, or interact.'
    });
  }

  next();
};
