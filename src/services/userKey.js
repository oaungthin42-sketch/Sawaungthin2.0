import { AsyncLocalStorage } from 'node:async_hooks';
import db from './db.js';
import { getSetting, decrypt } from './settings.js';

const als = new AsyncLocalStorage();

export function runWithUserKey(key, fn) {
    const normalizedKey = typeof key === 'string' && key.trim() ? key.trim() : null;
    return als.run({ userKey: normalizedKey }, fn);
}

export function hasUserGeminiKey() {
    const s = als.getStore();
    return !!(s && s.userKey);
}

export function getEffectiveGeminiKey() {
    const s = als.getStore();
    if (s && s.userKey) {
        return s.userKey;
    }
    return getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
}

export function getUserGeminiKey(userId) {
    if (!userId) return null;
    try {
        const row = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(userId);
        if (!row || !row.gemini_api_key) return null;
        const plain = decrypt(row.gemini_api_key);
        return typeof plain === 'string' && plain.trim() ? plain.trim() : null;
    } catch {
        return null;
    }
}
