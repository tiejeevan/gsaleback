const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Postgres connection
const { OAuth2Client } = require('google-auth-library');

// Google OAuth client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper to generate session ID
const generateSessionId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Helper to extract device info from user agent
const getDeviceInfo = (userAgent) => {
    if (!userAgent) return null;

    const isMobile = /mobile/i.test(userAgent);
    const isTablet = /tablet|ipad/i.test(userAgent);
    const isDesktop = !isMobile && !isTablet;

    let os = 'Unknown';
    if (/windows/i.test(userAgent)) os = 'Windows';
    else if (/mac/i.test(userAgent)) os = 'macOS';
    else if (/linux/i.test(userAgent)) os = 'Linux';
    else if (/android/i.test(userAgent)) os = 'Android';
    else if (/ios|iphone|ipad/i.test(userAgent)) os = 'iOS';

    let browser = 'Unknown';
    if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) browser = 'Chrome';
    else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
    else if (/firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/edg/i.test(userAgent)) browser = 'Edge';

    return {
        type: isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile',
        os,
        browser,
        isMobile,
        isTablet,
        isDesktop,
        userAgent
    };
};

// Helper to log user activities with enhanced tracking
const logActivity = async ({ userId, type, success, req, sessionId = null, errorMessage = null, metadata = null, duration = null }) => {
    try {
        const userAgent = req.get('User-Agent');
        const deviceInfo = getDeviceInfo(userAgent);

        await pool.query(
            `INSERT INTO user_logs (user_id, activity_type, ip_address, user_agent, success, session_id, device_info, error_message, metadata, duration)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                userId,
                type,
                req.ip,
                userAgent,
                success,
                sessionId,
                deviceInfo ? JSON.stringify(deviceInfo) : null,
                errorMessage,
                metadata ? JSON.stringify(metadata) : null,
                duration
            ]
        );
    } catch (err) {
        console.error('Error logging activity:', err.message);
    }
};

// ================= Signup =================
router.post('/signup', async (req, res) => {
    const { first_name, last_name, username, email, password } = req.body;

    try {
        // Check if username exists (must be unique)
        const existingUser = await pool.query(
            "SELECT * FROM users WHERE username = $1", [username]
        );
        if (existingUser.rows.length > 0) {
            await logActivity({ userId: null, type: 'signup', success: false, req });
            return res.status(400).json({ msg: 'Username already exists' });
        }

        // Check if password encryption is enabled
        const encryptionSetting = await pool.query(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'password_encryption_enabled'"
        );

        const isEncryptionEnabled = encryptionSetting.rows.length > 0
            ? encryptionSetting.rows[0].setting_value === 'true'
            : true; // Default to true if setting doesn't exist

        // Hash password only if encryption is enabled
        const finalPassword = isEncryptionEnabled
            ? await bcrypt.hash(password, 10)
            : password;

        // Insert new user
        const newUser = await pool.query(
            `INSERT INTO users (first_name, last_name, username, email, password)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, first_name, last_name, username, email, role`,
            [first_name, last_name, username, email, finalPassword]
        );

        // Log signup activity
        await logActivity({
            userId: newUser.rows[0].id,
            type: 'signup',
            success: true,
            req,
            metadata: { password_encrypted: isEncryptionEnabled }
        });

        // Create JWT token
        const token = jwt.sign(
            { id: newUser.rows[0].id },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token, user: newUser.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ================= Signin =================
router.post('/signin', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userRes = await pool.query(
            "SELECT * FROM users WHERE username = $1", [username]
        );
        const user = userRes.rows[0];

        if (!user) {
            await logActivity({
                userId: null,
                type: 'failed_login',
                success: false,
                req,
                errorMessage: 'User not found',
                metadata: { username }
            });
            return res.status(400).json({ msg: 'User not found' });
        }

        // Check if password is encrypted (starts with bcrypt hash pattern)
        const isPasswordEncrypted = user.password.startsWith('$2');

        let isMatch = false;
        if (isPasswordEncrypted) {
            // Compare encrypted password
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            // Compare plain text password
            isMatch = password === user.password;
        }

        if (!isMatch) {
            await logActivity({
                userId: user.id,
                type: 'failed_login',
                success: false,
                req,
                errorMessage: 'Invalid password',
                metadata: { username }
            });
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // Generate session ID for tracking
        const sessionId = generateSessionId();

        // JWT token with session ID
        const token = jwt.sign(
            { id: user.id, sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Log successful signin with session ID
        await logActivity({
            userId: user.id,
            type: 'signin',
            success: true,
            req,
            sessionId,
            metadata: { role: user.role }
        });

        res.json({
            token,
            sessionId, // Send session ID to frontend for logout tracking
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                email: user.email,
                role: user.role || 'user'
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ================= Signout =================
router.post('/signout', async (req, res) => {
    try {
        const { userId, sessionId, loginTime } = req.body;

        if (!userId) {
            return res.status(400).json({ msg: 'User ID required for signout' });
        }

        // Calculate session duration if loginTime provided
        let duration = null;
        if (loginTime) {
            const loginDate = new Date(loginTime);
            const now = new Date();
            duration = Math.floor((now - loginDate) / 1000); // Duration in seconds
        }

        await logActivity({
            userId,
            type: 'signout',
            success: true,
            req,
            sessionId,
            duration,
            metadata: { manual_logout: true }
        });

        res.json({ msg: 'Signout logged successfully' });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ================= Google Sign-In =================
router.post('/google', async (req, res) => {
    const { credential } = req.body;

    if (!credential) {
        return res.status(400).json({ error: 'Google credential is required' });
    }

    if (!GOOGLE_CLIENT_ID) {
        console.error('GOOGLE_CLIENT_ID is not configured');
        return res.status(500).json({ error: 'Google authentication is not configured' });
    }

    try {
        // Verify the Google ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const googleId = payload['sub']; // Google's unique user ID
        const email = payload['email'];
        const emailVerified = payload['email_verified'];
        const firstName = payload['given_name'] || '';
        const lastName = payload['family_name'] || '';
        const profilePicture = payload['picture'];
        const fullName = payload['name'] || `${firstName} ${lastName}`.trim();

        if (!emailVerified) {
            return res.status(400).json({ error: 'Google email is not verified' });
        }

        // Check if user exists by google_id
        let userResult = await pool.query(
            "SELECT * FROM users WHERE google_id = $1",
            [googleId]
        );

        let user = userResult.rows[0];
        let isNewUser = false;

        if (!user) {
            // Check if user exists by email (for account linking)
            userResult = await pool.query(
                "SELECT * FROM users WHERE email = $1",
                [email]
            );
            user = userResult.rows[0];

            if (user) {
                // Link existing account to Google
                await pool.query(
                    `UPDATE users SET 
                        google_id = $1, 
                        google_profile_image = $2,
                        auth_provider = CASE 
                            WHEN auth_provider = 'local' THEN 'local' 
                            ELSE $3 
                        END
                     WHERE id = $4`,
                    [googleId, profilePicture, 'google', user.id]
                );

                // Log account linking
                await logActivity({
                    userId: user.id,
                    type: 'google_account_linked',
                    success: true,
                    req,
                    metadata: { email, google_id: googleId }
                });
            } else {
                // Create new user
                isNewUser = true;

                // Generate unique username from email
                let baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                let username = baseUsername;
                let counter = 1;

                // Ensure username is unique
                while (true) {
                    const existingUser = await pool.query(
                        "SELECT id FROM users WHERE username = $1",
                        [username]
                    );
                    if (existingUser.rows.length === 0) break;
                    username = `${baseUsername}${counter}`;
                    counter++;
                }

                // Insert new user (no password for Google-only users)
                const newUserResult = await pool.query(
                    `INSERT INTO users (
                        first_name, last_name, username, email, 
                        google_id, google_profile_image, profile_image,
                        auth_provider, is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
                    RETURNING id, first_name, last_name, username, email, role, profile_image`,
                    [
                        firstName,
                        lastName,
                        username,
                        email,
                        googleId,
                        profilePicture,
                        profilePicture, // Also set as main profile image
                        'google'
                    ]
                );

                user = newUserResult.rows[0];

                // Log signup activity
                await logActivity({
                    userId: user.id,
                    type: 'signup',
                    success: true,
                    req,
                    metadata: { auth_provider: 'google', email }
                });
            }
        }

        // Generate session ID for tracking
        const sessionId = generateSessionId();

        // Create JWT token
        const token = jwt.sign(
            { id: user.id, sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Log signin activity
        await logActivity({
            userId: user.id,
            type: 'signin',
            success: true,
            req,
            sessionId,
            metadata: {
                auth_provider: 'google',
                is_new_user: isNewUser
            }
        });

        // Fetch complete user data
        const fullUserResult = await pool.query(
            `SELECT id, first_name, last_name, username, email, role, 
                    profile_image, google_profile_image
             FROM users WHERE id = $1`,
            [user.id]
        );

        const fullUser = fullUserResult.rows[0];

        res.json({
            token,
            sessionId,
            isNewUser,
            user: {
                id: fullUser.id,
                first_name: fullUser.first_name,
                last_name: fullUser.last_name,
                username: fullUser.username,
                email: fullUser.email,
                role: fullUser.role || 'user',
                profile_image: fullUser.profile_image || fullUser.google_profile_image
            }
        });

    } catch (err) {
        console.error('Google auth error:', err);

        if (err.message.includes('Token used too late') || err.message.includes('Invalid token')) {
            return res.status(401).json({ error: 'Invalid or expired Google token' });
        }

        res.status(500).json({ error: 'Google authentication failed' });
    }
});

// ================= Google Sign-In (Implicit Flow with User Info) =================
router.post('/google-userinfo', async (req, res) => {
    const { access_token, user_info } = req.body;

    if (!access_token || !user_info) {
        return res.status(400).json({ error: 'Access token and user info are required' });
    }

    try {
        // Validate the access token by making a request to Google
        const tokenInfoResponse = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?access_token=${access_token}`
        );

        if (!tokenInfoResponse.ok) {
            return res.status(401).json({ error: 'Invalid Google access token' });
        }

        const tokenInfo = await tokenInfoResponse.json();

        // Verify the token is for our app
        if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
            return res.status(401).json({ error: 'Token was not issued for this application' });
        }

        const googleId = user_info.sub;
        const email = user_info.email;
        const emailVerified = user_info.email_verified;
        const firstName = user_info.given_name || '';
        const lastName = user_info.family_name || '';
        const profilePicture = user_info.picture;

        if (!emailVerified) {
            return res.status(400).json({ error: 'Google email is not verified' });
        }

        // Check if user exists by google_id
        let userResult = await pool.query(
            "SELECT * FROM users WHERE google_id = $1",
            [googleId]
        );

        let user = userResult.rows[0];
        let isNewUser = false;

        if (!user) {
            // Check if user exists by email (for account linking)
            userResult = await pool.query(
                "SELECT * FROM users WHERE email = $1",
                [email]
            );
            user = userResult.rows[0];

            if (user) {
                // Link existing account to Google
                await pool.query(
                    `UPDATE users SET 
                        google_id = $1, 
                        google_profile_image = $2,
                        auth_provider = CASE 
                            WHEN auth_provider = 'local' THEN 'local' 
                            ELSE $3 
                        END
                     WHERE id = $4`,
                    [googleId, profilePicture, 'google', user.id]
                );

                await logActivity({
                    userId: user.id,
                    type: 'google_account_linked',
                    success: true,
                    req,
                    metadata: { email, google_id: googleId }
                });
            } else {
                // Create new user
                isNewUser = true;

                let baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                let username = baseUsername;
                let counter = 1;

                while (true) {
                    const existingUser = await pool.query(
                        "SELECT id FROM users WHERE username = $1",
                        [username]
                    );
                    if (existingUser.rows.length === 0) break;
                    username = `${baseUsername}${counter}`;
                    counter++;
                }

                const newUserResult = await pool.query(
                    `INSERT INTO users (
                        first_name, last_name, username, email, 
                        google_id, google_profile_image, profile_image,
                        auth_provider, is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
                    RETURNING id, first_name, last_name, username, email, role, profile_image`,
                    [
                        firstName,
                        lastName,
                        username,
                        email,
                        googleId,
                        profilePicture,
                        profilePicture,
                        'google'
                    ]
                );

                user = newUserResult.rows[0];

                await logActivity({
                    userId: user.id,
                    type: 'signup',
                    success: true,
                    req,
                    metadata: { auth_provider: 'google', email }
                });
            }
        }

        const sessionId = generateSessionId();

        const token = jwt.sign(
            { id: user.id, sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        await logActivity({
            userId: user.id,
            type: 'signin',
            success: true,
            req,
            sessionId,
            metadata: {
                auth_provider: 'google',
                is_new_user: isNewUser
            }
        });

        const fullUserResult = await pool.query(
            `SELECT id, first_name, last_name, username, email, role, 
                    profile_image, google_profile_image
             FROM users WHERE id = $1`,
            [user.id]
        );

        const fullUser = fullUserResult.rows[0];

        res.json({
            token,
            sessionId,
            isNewUser,
            user: {
                id: fullUser.id,
                first_name: fullUser.first_name,
                last_name: fullUser.last_name,
                username: fullUser.username,
                email: fullUser.email,
                role: fullUser.role || 'user',
                profile_image: fullUser.profile_image || fullUser.google_profile_image
            }
        });

    } catch (err) {
        console.error('Google userinfo auth error:', err);
        res.status(500).json({ error: 'Google authentication failed' });
    }
});

module.exports = router;
