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
        const adminEmail = process.env.ADMIN_EMAIL;

        if (!user) {
            const role = (adminEmail && email === adminEmail) ? 'admin' : 'user';
            
            const id = uuidv4();
            const stmt = db.prepare(`
                INSERT INTO users (id, googleId, email, name, role, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run(id, googleId, email, name, role, 'active');
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        } else {
            if (adminEmail && email === adminEmail && user.role !== 'admin') {
                db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
            }
        }

        if (user.status === 'suspended') {
            return res.status(403).json({ error: 'Your account has been suspended' });
        }

        db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
        req.session.userId = user.id;
        console.log(`[AUTH] Session set for user ${user.id} (${user.email}). Session ID: ${req.sessionID}`);
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
    console.log(`[AUTH] Incoming request to ${req.method} ${req.originalUrl} — session present: ${!!req.session}, userId: ${req.session?.userId || 'none'}, cookie header: ${req.headers.cookie ? 'present' : 'MISSING'}`);
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
