import express from 'express';
import db from '../services/db.js';
import { encrypt, decrypt } from '../services/settings.js';
import { authMiddleware, adminOnly } from './auth.js';
import axios from 'axios';

import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const slipDir = path.join(process.cwd(), 'data', 'output', 'slips');
if (!fs.existsSync(slipDir)) fs.mkdirSync(slipDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, slipDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({ storage });

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
    res.set('Cache-Control', 'no-store');
    try {
        const users = db.prepare('SELECT id, email, name, role, status, credits, created_at, last_login FROM users ORDER BY last_login DESC').all();
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.post('/admin/users/:id/credits', authMiddleware, adminOnly, (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.params.id;
        console.log(`[CREDITS] Admin ${req.user.email} adjusting user ${userId} by ${amount} (type: ${typeof amount})`);
        const before = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
        const result = db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(amount, userId);
        const after = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
        console.log(`[CREDITS] Before: ${before?.credits}, After: ${after?.credits}, rows changed: ${result.changes}`);
        res.json({ success: true, credits: after?.credits });
    } catch (e) {
        console.error(`[CREDITS] Error:`, e);
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

router.post('/admin/feedback/:id/reply', authMiddleware, adminOnly, (req, res) => {
    try {
        const { reply } = req.body;
        db.prepare('UPDATE feedback SET adminReply = ?, isRead = 0 WHERE id = ?').run(reply, req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to reply to feedback' });
    }
});

router.get('/feedback', authMiddleware, (req, res) => {
    try {
        const rows = db.prepare('SELECT id, rating, comment, adminReply, isRead, created_at FROM feedback WHERE userId = ? ORDER BY created_at DESC').all(req.user.id);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch feedback' });
    }
});

router.post('/feedback/:id/read', authMiddleware, (req, res) => {
    try {
        db.prepare('UPDATE feedback SET isRead = 1 WHERE id = ? AND userId = ?').run(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to mark feedback as read' });
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


router.post('/payment-request', authMiddleware, upload.single('slip'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Slip image is required' });
        }
        const slipPath = `/output/slips/${req.file.filename}`;
        const id = uuidv4();
        db.prepare(`
            INSERT INTO payment_requests (id, userId, slipImagePath, status)
            VALUES (?, ?, ?, 'pending')
        `).run(id, req.user.id, slipPath);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to submit payment request' });
    }
});

router.get('/admin/payment-requests', authMiddleware, adminOnly, (req, res) => {
    try {
        const requests = db.prepare(`
            SELECT p.*, u.email as userEmail, u.name as userName 
            FROM payment_requests p 
            JOIN users u ON p.userId = u.id 
            ORDER BY p.created_at DESC
        `).all();
        res.json(requests);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch payment requests' });
    }
});

router.post('/admin/payment-requests/:id/approve', authMiddleware, adminOnly, (req, res) => {
    try {
        const { credits } = req.body;
        const reqId = req.params.id;
        
        const request = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(reqId);
        if (!request || request.status !== 'pending') {
            return res.status(400).json({ error: 'Invalid or already processed request' });
        }

        const updateCredits = db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?');
        const updateStatus = db.prepare("UPDATE payment_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?");
        
        db.transaction(() => {
            updateCredits.run(credits, request.userId);
            updateStatus.run(reqId);
        })();
        
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to approve request' });
    }
});

router.post('/admin/payment-requests/:id/reject', authMiddleware, adminOnly, (req, res) => {
    try {
        const reqId = req.params.id;
        db.prepare("UPDATE payment_requests SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").run(reqId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to reject request' });
    }
});

export default router;
