import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import db from '../services/db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// You need to configure this environment variable
const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ error: 'Missing credential' });
        }

        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: CLIENT_ID,
        });
        const payload = ticket.getPayload();
        
        if (!payload || !payload.email) {
             return res.status(400).json({ error: 'Invalid token payload' });
        }

        const email = payload.email;
        const name = payload.name;
        const googleId = payload.sub;

        let user = db.prepare('SELECT * FROM users WHERE googleId = ?').get(googleId);

        if (!user) {
            const adminEmail = process.env.ADMIN_EMAIL;
            const role = (adminEmail && email === adminEmail) ? 'admin' : 'user';
            
            const id = uuidv4();
            const stmt = db.prepare(`
                INSERT INTO users (id, googleId, email, name, role, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run(id, googleId, email, name, role, 'active');
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        }

        if (user.status === 'suspended') {
            return res.status(403).json({ error: 'Your account has been suspended' });
        }

        req.session.userId = user.id;
        res.json({ success: true, user });

    } catch (error) {
        console.error("Auth error", error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

router.get('/me', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    if (user.status === 'suspended') {
        req.session.destroy();
        return res.status(403).json({ error: 'Your account has been suspended' });
    }
    res.json({ user });
});

router.post('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            res.json({ success: true });
        });
    } else {
        res.json({ success: true });
    }
});

export const authMiddleware = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    if (user.status === 'suspended') {
        return res.status(403).json({ error: 'Your account has been suspended' });
    }
    req.user = user;
    next();
};

export const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

export default router;
