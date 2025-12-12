const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// WebAuthn configuration
const rpName = 'GSale App';
const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000', 
    'http://192.168.1.107:5173',
    process.env.WEBAUTHN_ORIGIN
].filter(Boolean);

// Function to get the appropriate origin for the request
const getOriginForRequest = (req) => {
    const requestOrigin = req.get('Origin') || req.get('Referer');
    if (requestOrigin) {
        const origin = new URL(requestOrigin).origin;
        if (allowedOrigins.includes(origin)) {
            return origin;
        }
    }
    return allowedOrigins[0]; // Default to localhost
};

// Helper functions
const generateSessionId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const logActivity = async ({ userId, type, success, req, sessionId = null, errorMessage = null, metadata = null }) => {
    try {
        const userAgent = req.get('User-Agent');
        await pool.query(
            `INSERT INTO user_logs (user_id, activity_type, ip_address, user_agent, success, session_id, error_message, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId, type, req.ip, userAgent, success, sessionId, errorMessage, metadata ? JSON.stringify(metadata) : null]
        );
    } catch (err) {
        console.error('Error logging activity:', err.message);
    }
};

// ================= Registration Flow =================

// Step 1: Generate registration options
router.post('/register/begin', async (req, res) => {
    try {
        const { userId } = req.body;
        console.log('WebAuthn register/begin - received userId:', userId, 'type:', typeof userId);

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Get user info
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        console.log('User query result:', userResult.rows.length, 'rows found');
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Get existing authenticators for this user
        const existingAuthenticators = await pool.query(
            'SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1',
            [userId]
        );

        const excludeCredentials = existingAuthenticators.rows.map(auth => ({
            id: Buffer.from(auth.credential_id, 'base64'),
            type: 'public-key',
            transports: auth.transports ? JSON.parse(auth.transports) : undefined,
        }));

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: new Uint8Array(Buffer.from(userId.toString())),
            userName: user.username,
            userDisplayName: `${user.first_name} ${user.last_name}`,
            attestationType: 'none',
            excludeCredentials,
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'required',
                authenticatorAttachment: 'platform', // Prefer platform authenticators (Touch ID, Face ID, Windows Hello)
            },
        });

        // Store challenge in database temporarily
        const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
        await pool.query(
            'INSERT INTO webauthn_challenges (user_id, challenge, expires_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET challenge = $2, expires_at = $3',
            [userId, options.challenge, expiryTime]
        );
        
        console.log(`Stored challenge for user ${userId}: ${options.challenge.substring(0, 20)}...`);
        console.log(`Challenge expires at: ${expiryTime.toISOString()}`);
        console.log(`Current time: ${new Date().toISOString()}`);

        await logActivity({
            userId,
            type: 'webauthn_register_begin',
            success: true,
            req,
            metadata: { rpID, excludeCredentials: excludeCredentials.length }
        });

        res.json(options);
    } catch (error) {
        console.error('WebAuthn registration begin error:', error);
        await logActivity({
            userId: req.body.userId,
            type: 'webauthn_register_begin',
            success: false,
            req,
            errorMessage: error.message
        });
        res.status(500).json({ error: 'Failed to generate registration options' });
    }
});

// Step 2: Verify registration response
router.post('/register/complete', async (req, res) => {
    try {
        const { userId, credential: clientCredential } = req.body;
        console.log('WebAuthn register/complete - received userId:', userId, 'type:', typeof userId);
        console.log('Credential keys:', Object.keys(clientCredential || {}));

        if (!userId || !clientCredential) {
            return res.status(400).json({ error: 'User ID and credential are required' });
        }

        // Get stored challenge
        const challengeResult = await pool.query(
            'SELECT challenge FROM webauthn_challenges WHERE user_id = $1 AND expires_at > NOW()',
            [userId]
        );

        console.log(`Looking for challenge for user ${userId}, found ${challengeResult.rows.length} rows`);
        console.log(`Current time for comparison: ${new Date().toISOString()}`);

        // If no valid challenge found, check for any challenge (even expired)
        let expectedChallenge;
        if (challengeResult.rows.length === 0) {
            // Check if there's an expired challenge
            const expiredResult = await pool.query(
                'SELECT challenge, expires_at FROM webauthn_challenges WHERE user_id = $1',
                [userId]
            );
            console.log('Expired challenges:', expiredResult.rows);
            
            if (expiredResult.rows.length === 0) {
                return res.status(400).json({ error: 'No challenge found for user' });
            }
            
            const challenge = expiredResult.rows[0];
            const timeDiff = new Date() - new Date(challenge.expires_at);
            console.log('Time difference in seconds:', timeDiff / 1000);
            
            // If challenge expired less than 2 minutes ago, use it anyway
            if (timeDiff > 120000) {
                return res.status(400).json({ error: 'Challenge expired too long ago' });
            }
            
            console.log('Using recently expired challenge');
            expectedChallenge = challenge.challenge;
        } else {
            expectedChallenge = challengeResult.rows[0].challenge;
        }

        console.log(`Retrieved challenge: ${expectedChallenge.substring(0, 20)}...`);

        // Verify the registration response
        const requestOrigin = getOriginForRequest(req);
        console.log(`Using origin for registration verification: ${requestOrigin}`);
        
        const verification = await verifyRegistrationResponse({
            response: clientCredential,
            expectedChallenge,
            expectedOrigin: requestOrigin,
            expectedRPID: rpID,
        });

        if (!verification.verified || !verification.registrationInfo) {
            await logActivity({
                userId,
                type: 'webauthn_register_complete',
                success: false,
                req,
                errorMessage: 'Registration verification failed'
            });
            return res.status(400).json({ error: 'Registration verification failed' });
        }

        console.log('Registration info:', verification.registrationInfo);
        console.log('Registration info keys:', Object.keys(verification.registrationInfo));

        // Extract credential data from the correct structure
        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;
        
        console.log('Extracted values:', {
            credentialID: credentialID ? 'present' : 'undefined',
            credentialPublicKey: credentialPublicKey ? 'present' : 'undefined',
            counter,
            credentialDeviceType,
            credentialBackedUp
        });

        // Store the credential
        await pool.query(
            `INSERT INTO webauthn_credentials 
             (user_id, credential_id, public_key, counter, device_type, backed_up, transports, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
                userId,
                Buffer.from(credentialID).toString('base64'),
                Buffer.from(credentialPublicKey).toString('base64'),
                counter,
                credentialDeviceType,
                credentialBackedUp,
                JSON.stringify(clientCredential.response.transports || [])
            ]
        );

        // Clean up challenge
        await pool.query('DELETE FROM webauthn_challenges WHERE user_id = $1', [userId]);

        await logActivity({
            userId,
            type: 'webauthn_register_complete',
            success: true,
            req,
            metadata: {
                credentialDeviceType,
                credentialBackedUp,
                transports: clientCredential.response.transports
            }
        });

        res.json({ verified: true, message: 'WebAuthn credential registered successfully' });
    } catch (error) {
        console.error('WebAuthn registration complete error:', error);
        await logActivity({
            userId: req.body.userId,
            type: 'webauthn_register_complete',
            success: false,
            req,
            errorMessage: error.message
        });
        res.status(500).json({ error: 'Failed to complete registration' });
    }
});

// ================= Authentication Flow =================

// Step 1: Generate authentication options
router.post('/authenticate/begin', async (req, res) => {
    try {
        const { username } = req.body;

        let allowCredentials = [];

        if (username) {
            // Get user's credentials if username provided
            const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
            if (userResult.rows.length > 0) {
                const userId = userResult.rows[0].id;
                const credentialsResult = await pool.query(
                    'SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1',
                    [userId]
                );

                allowCredentials = credentialsResult.rows.map(cred => ({
                    id: Buffer.from(cred.credential_id, 'base64'),
                    type: 'public-key',
                    transports: cred.transports ? JSON.parse(cred.transports) : undefined,
                }));
            }
        }

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'preferred',
        });

        // Store challenge temporarily (without user association for usernameless flow)
        const challengeId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const expiryTime = new Date(Date.now() + 5 * 60 * 1000);
        
        console.log(`Creating auth challenge ID: ${challengeId}`);
        console.log(`Challenge expires at: ${expiryTime.toISOString()}`);
        console.log(`Current time: ${new Date().toISOString()}`);
        
        await pool.query(
            'INSERT INTO webauthn_auth_challenges (challenge_id, challenge, username, expires_at) VALUES ($1, $2, $3, $4)',
            [challengeId, options.challenge, username || null, expiryTime.toISOString()]
        );

        await logActivity({
            userId: null,
            type: 'webauthn_auth_begin',
            success: true,
            req,
            metadata: { username: username || 'usernameless', allowCredentials: allowCredentials.length }
        });

        res.json({ ...options, challengeId });
    } catch (error) {
        console.error('WebAuthn authentication begin error:', error);
        await logActivity({
            userId: null,
            type: 'webauthn_auth_begin',
            success: false,
            req,
            errorMessage: error.message
        });
        res.status(500).json({ error: 'Failed to generate authentication options' });
    }
});

// Step 2: Verify authentication response
router.post('/authenticate/complete', async (req, res) => {
    try {
        const { challengeId, credential } = req.body;

        if (!challengeId || !credential) {
            return res.status(400).json({ error: 'Challenge ID and credential are required' });
        }

        // Get stored challenge
        const challengeResult = await pool.query(
            'SELECT challenge, username, expires_at FROM webauthn_auth_challenges WHERE challenge_id = $1',
            [challengeId]
        );

        console.log(`Looking for challenge ID: ${challengeId}`);
        console.log(`Found ${challengeResult.rows.length} challenges`);
        console.log(`Current time: ${new Date().toISOString()}`);

        if (challengeResult.rows.length === 0) {
            console.log('No challenge found with this ID');
            return res.status(400).json({ error: 'Invalid challenge ID' });
        }

        const challenge = challengeResult.rows[0];
        const now = new Date();
        const expiresAt = new Date(challenge.expires_at);
        
        console.log(`Challenge expires at: ${expiresAt.toISOString()}`);
        console.log(`Current time: ${now.toISOString()}`);
        console.log(`Time until expiry: ${(expiresAt - now) / 1000}s`);

        if (now > expiresAt) {
            const timeDiff = now - expiresAt;
            console.log(`Challenge expired ${timeDiff / 1000}s ago`);
            return res.status(400).json({ error: 'Challenge has expired' });
        }

        const { challenge: expectedChallenge, username } = challenge;

        // Find the credential in database
        console.log(`Raw credential.rawId: ${credential.rawId}`);
        console.log(`Raw credential.rawId type: ${typeof credential.rawId}`);
        
        // Try different approaches to match the stored credential ID
        const approach1 = credential.rawId; // Direct use
        const approach2 = Buffer.from(credential.rawId, 'base64').toString('base64'); // Double conversion
        const approach3 = Buffer.from(credential.rawId).toString('base64'); // Single conversion
        
        console.log(`Approach 1 (direct): ${approach1}`);
        console.log(`Approach 2 (double): ${approach2}`);
        console.log(`Approach 3 (single): ${approach3}`);
        
        const receivedCredentialId = approach3; // Use approach 3 which matches the database
        
        // First, let's see what credentials exist in the database
        const allCredentialsResult = await pool.query(
            'SELECT credential_id, user_id FROM webauthn_credentials LIMIT 10'
        );
        console.log(`Found ${allCredentialsResult.rows.length} total credentials in database:`);
        allCredentialsResult.rows.forEach((cred, index) => {
            console.log(`  ${index + 1}. ID: ${cred.credential_id} (User: ${cred.user_id})`);
        });
        
        const credentialResult = await pool.query(
            'SELECT wc.*, u.id as user_id, u.username, u.first_name, u.last_name, u.email, u.role FROM webauthn_credentials wc JOIN users u ON wc.user_id = u.id WHERE wc.credential_id = $1',
            [receivedCredentialId]
        );

        if (credentialResult.rows.length === 0) {
            console.log(`No matching credential found for ID: ${receivedCredentialId}`);
            
            await logActivity({
                userId: null,
                type: 'webauthn_auth_complete',
                success: false,
                req,
                errorMessage: 'Credential not found'
            });
            return res.status(400).json({ error: 'Credential not found' });
        }

        const dbCredential = credentialResult.rows[0];
        console.log('Database credential object:', {
            credential_id: dbCredential.credential_id ? 'present' : 'missing',
            public_key: dbCredential.public_key ? 'present' : 'missing',
            counter: dbCredential.counter,
            counter_type: typeof dbCredential.counter,
            transports: dbCredential.transports,
            user_id: dbCredential.user_id
        });
        
        const user = {
            id: dbCredential.user_id,
            username: dbCredential.username,
            first_name: dbCredential.first_name,
            last_name: dbCredential.last_name,
            email: dbCredential.email,
            role: dbCredential.role
        };

        // Verify the authentication response
        const requestOrigin = getOriginForRequest(req);
        console.log(`Using origin for authentication verification: ${requestOrigin}`);
        
        // Correct WebAuthnCredential structure for SimpleWebAuthn v13
        const credentialObj = {
            id: dbCredential.credential_id, // Base64URLString
            publicKey: Buffer.from(dbCredential.public_key, 'base64'), // Uint8Array
            counter: parseInt(dbCredential.counter) || 0, // number
            transports: dbCredential.transports ? JSON.parse(dbCredential.transports) : undefined,
        };
        
        console.log('Credential object being passed to verification:', {
            id: credentialObj.id ? 'present' : 'missing',
            publicKey: credentialObj.publicKey ? `Buffer(${credentialObj.publicKey.length})` : 'missing',
            counter: credentialObj.counter,
            counter_type: typeof credentialObj.counter,
            transports: credentialObj.transports
        });
        
        console.log('Verification parameters:', {
            expectedChallenge: expectedChallenge ? expectedChallenge.substring(0, 20) + '...' : 'missing',
            expectedOrigin: requestOrigin,
            expectedRPID: rpID,
            credentialResponse: credential ? 'present' : 'missing'
        });
        
        console.log('Credential response structure:', {
            id: credential.id ? 'present' : 'missing',
            rawId: credential.rawId ? 'present' : 'missing',
            response: credential.response ? {
                authenticatorData: credential.response.authenticatorData ? 'present' : 'missing',
                clientDataJSON: credential.response.clientDataJSON ? 'present' : 'missing',
                signature: credential.response.signature ? 'present' : 'missing',
                userHandle: credential.response.userHandle
            } : 'missing',
            type: credential.type
        });
        
        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge,
                expectedOrigin: requestOrigin,
                expectedRPID: rpID,
                credential: credentialObj, // Correct WebAuthnCredential structure
            });
            console.log('Authentication verification successful!');
        } catch (verificationError) {
            console.error('WebAuthn verification failed:', verificationError.message);
            throw verificationError;
        }

        if (!verification.verified) {
            await logActivity({
                userId: user.id,
                type: 'webauthn_auth_complete',
                success: false,
                req,
                errorMessage: 'Authentication verification failed'
            });
            return res.status(400).json({ error: 'Authentication verification failed' });
        }

        // Update counter
        const newCounter = verification.authenticationInfo.newCounter;
        console.log(`Updating counter from ${credentialObj.counter} to ${newCounter}`);
        await pool.query(
            'UPDATE webauthn_credentials SET counter = $1, last_used = NOW() WHERE credential_id = $2',
            [newCounter, dbCredential.credential_id]
        );

        // Clean up challenge
        await pool.query('DELETE FROM webauthn_auth_challenges WHERE challenge_id = $1', [challengeId]);

        // Generate session
        const sessionId = generateSessionId();
        const token = jwt.sign(
            { id: user.id, sessionId },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        await logActivity({
            userId: user.id,
            type: 'webauthn_auth_complete',
            success: true,
            req,
            sessionId,
            metadata: { role: user.role, method: 'webauthn' }
        });

        res.json({
            verified: true,
            token,
            sessionId,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('WebAuthn authentication complete error:', error);
        await logActivity({
            userId: null,
            type: 'webauthn_auth_complete',
            success: false,
            req,
            errorMessage: error.message
        });
        res.status(500).json({ error: 'Failed to complete authentication' });
    }
});

// ================= Management Endpoints =================

// Get user's WebAuthn credentials
router.get('/credentials/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const credentials = await pool.query(
            `SELECT credential_id, device_type, backed_up, transports, created_at, last_used 
             FROM webauthn_credentials 
             WHERE user_id = $1 
             ORDER BY created_at DESC`,
            [userId]
        );

        const formattedCredentials = credentials.rows.map(cred => ({
            id: cred.credential_id,
            deviceType: cred.device_type,
            backedUp: cred.backed_up,
            transports: cred.transports ? JSON.parse(cred.transports) : [],
            createdAt: cred.created_at,
            lastUsed: cred.last_used,
            name: `${cred.device_type === 'singleDevice' ? 'Device' : 'Cross-platform'} Authenticator`
        }));

        res.json(formattedCredentials);
    } catch (error) {
        console.error('Get credentials error:', error);
        res.status(500).json({ error: 'Failed to get credentials' });
    }
});

// Delete a WebAuthn credential
router.delete('/credentials/:userId/:credentialId', async (req, res) => {
    try {
        const { userId, credentialId } = req.params;

        const result = await pool.query(
            'DELETE FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2',
            [userId, credentialId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Credential not found' });
        }

        await logActivity({
            userId: parseInt(userId),
            type: 'webauthn_credential_deleted',
            success: true,
            req,
            metadata: { credentialId }
        });

        res.json({ message: 'Credential deleted successfully' });
    } catch (error) {
        console.error('Delete credential error:', error);
        res.status(500).json({ error: 'Failed to delete credential' });
    }
});

// Check WebAuthn support
router.get('/support', (req, res) => {
    res.json({
        supported: true,
        rpName,
        rpID,
        features: {
            registration: true,
            authentication: true,
            usernameless: true,
            crossPlatform: true,
            platformAuthenticators: true
        }
    });
});

module.exports = router;