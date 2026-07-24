import db from './db.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Setup settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Clean up any leaked or pre-configured global keys from database
try {
    db.exec(`DELETE FROM settings WHERE key IN ('GEMINI_API_KEY')`);
} catch (e) {
    console.error('Failed to clear database keys', e);
}

const dataDir = path.join(process.cwd(), 'data');
const keyPath = path.join(dataDir, 'encryption.key');

let encryptionKey;
if (fs.existsSync(keyPath)) {
    encryptionKey = fs.readFileSync(keyPath);
} else {
    encryptionKey = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, encryptionKey);
}

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    if (!text) return text;
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export const getSetting = (key) => {
    const _getRaw = (k) => {
        const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
        const row = stmt.get(k);
        if (!row) return null;
        try {
            return decrypt(row.value);
        } catch (e) {
            console.error('Failed to decrypt setting', k, e);
            return null;
        }
    };

    if (key === 'NARRATION_MODE') {
        let val = _getRaw('NARRATION_MODE');
        if (val) return val;

        // Migration from old settings
        const oldTranslation = _getRaw('TRANSLATION_STYLE');
        const oldNaturalness = _getRaw('BURMESE_NATURALNESS');

        if (oldTranslation === 'dialogue') return 'dialogue';
        if (oldNaturalness === 'high_colloquial') return 'colloquial';
        return 'normal';
    }

    return _getRaw(key);
};

export const setSetting = (key, value) => {
    if (key === 'GEMINI_API_KEY') {
        console.warn(`[Settings] Rejected persistent save of security key: ${key}`);
        return;
    }
    const encrypted = encrypt(value);
    const stmt = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, encrypted);
};

export const deleteSetting = (key) => {
    const stmt = db.prepare('DELETE FROM settings WHERE key = ?');
    stmt.run(key);
};

export const getAllSettingsMasked = () => {
    const keys = ['EDGE_TTS_VOICE', 'NARRATION_MODE', 'VOICE_SPEED', 'VOICE_PITCH', 'AUDIO_LOUDNESS', 'SYNC_MODE', 'OUTPUT_SPEED_MULTIPLIER'];
    const result = {
        GEMINI_API_KEY: { configured: false }
    };
    for (const k of keys) {
        const val = getSetting(k);
        if (val) {
            if (k.endsWith('_KEY')) {
                const masked = '•'.repeat(16) + val.slice(-4);
                result[k] = { configured: true, masked };
            } else {
                result[k] = { configured: true, value: val };
            }
        } else {
            result[k] = { configured: false };
        }
    }
    return result;
};
