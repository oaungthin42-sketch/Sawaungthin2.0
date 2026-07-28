import express from 'express';
import db from '../services/db.js';
import { encrypt, decrypt } from '../services/settings.js';
import { authMiddleware, adminOnly } from './auth.js';
import axios from 'axios';

import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

router.get('/credits', authMiddleware, (req, res) => {
    try {
        const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
        res.json({ credits: user.credits });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch credits' });
    }
});

router.get('/admin/users', authMiddleware, adminOnly, (req, res) => {
    try {
        const users = db.prepare('SELECT id, email, name, role, status, credits, created_at FROM users ORDER BY created_at DESC').all();
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.post('/admin/users/:id/credits', authMiddleware, adminOnly, (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.params.id;
        db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(amount, userId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update credits' });
    }
});

router.post('/admin/users/:id/suspend', authMiddleware, adminOnly, (req, res) => {
    try {
        db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to suspend user' });
    }
});

router.post('/admin/users/:id/activate', authMiddleware, adminOnly, (req, res) => {
    try {
        db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to activate user' });
    }
});

router.post('/feedback', authMiddleware, (req, res) => {
    try {
        const { jobId, rating, comment } = req.body;
        const id = uuidv4();
        db.prepare(`
            INSERT INTO feedback (id, userId, jobId, rating, comment)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, req.user.id, jobId || null, rating, comment || null);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

router.get('/admin/feedback', authMiddleware, adminOnly, (req, res) => {
    try {
        const feedback = db.prepare(`
            SELECT f.*, u.email as userEmail, u.name as userName 
            FROM feedback f 
            JOIN users u ON f.userId = u.id 
            ORDER BY f.created_at DESC
        `).all();
        res.json(feedback);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch feedback' });
    }
});

router.get('/admin/jobs', authMiddleware, adminOnly, (req, res) => {
    try {
        const jobs = db.prepare(`
            SELECT j.*, u.email as userEmail, u.name as userName 
            FROM jobs j 
            LEFT JOIN users u ON j.userId = u.id 
            ORDER BY j.created_at DESC
        `).all();
        res.json(jobs);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

router.get('/api-key', authMiddleware, (req, res) => {
    try {
        const user = req.user;
        let masked = null;
        if (user.geminiApiKeyEncrypted) {
            const dec = decrypt(user.geminiApiKeyEncrypted);
            if (dec && dec.length > 8) {
                masked = dec.substring(0, 4) + '*'.repeat(dec.length - 8) + dec.substring(dec.length - 4);
            } else if (dec) {
                masked = '****';
            }
        }
        res.json({ configured: !!user.geminiApiKeyEncrypted, masked });
    } catch (e) {
        res.status(500).json({ error: 'Failed to retrieve API key' });
    }
});

router.post('/api-key', authMiddleware, (req, res) => {
    try {
        const { apiKey } = req.body;
        if (apiKey) {
            const encrypted = encrypt(apiKey);
            const stmt = db.prepare('UPDATE users SET geminiApiKeyEncrypted = ? WHERE id = ?');
            stmt.run(encrypted, req.user.id);
        } else {
            const stmt = db.prepare('UPDATE users SET geminiApiKeyEncrypted = NULL WHERE id = ?');
            stmt.run(req.user.id);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save API key' });
    }
});

router.post('/api-key/test', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user.geminiApiKeyEncrypted) {
            return res.status(400).json({ error: 'No API key configured.' });
        }
        const apiKey = decrypt(user.geminiApiKeyEncrypted);
        if (!apiKey) {
             return res.status(400).json({ error: 'Failed to decrypt API key.' });
        }
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: "Hello" }] }]
        }, { timeout: 10000 });
        
        res.json({ valid: true });
    } catch (e) {
        res.json({ valid: false, error: e.response?.data?.error?.message || e.message });
    }
});

export default router;
