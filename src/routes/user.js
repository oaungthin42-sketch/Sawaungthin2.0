import express from 'express';
import db from '../services/db.js';
import { encrypt, decrypt } from '../services/settings.js';
import { authMiddleware } from './auth.js';
import axios from 'axios';

const router = express.Router();

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
