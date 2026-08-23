import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'jobs.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    videoPath TEXT,
    audioPath TEXT,
    status TEXT,
    progress REAL,
    error TEXT,
    result TEXT,
    currentStep TEXT,
    created_at INTEGER,
    originalFilename TEXT,
    completed_at INTEGER
  );
`);

export default db;

try { db.exec(`ALTER TABLE jobs ADD COLUMN originalFilename TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN completed_at INTEGER`); } catch (e) {}

try { db.exec(`ALTER TABLE jobs ADD COLUMN blurBoxes TEXT`); } catch (e) {}

try { db.exec(`ALTER TABLE jobs ADD COLUMN subtitlePosition TEXT`); } catch (e) {}

try { db.exec(`ALTER TABLE jobs ADD COLUMN selectedFontId TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN subtitleColor TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN speed REAL DEFAULT 1.0`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN flipped INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN voiceProvider TEXT DEFAULT 'edge'`); } catch (e) {}

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS fonts (
            id TEXT PRIMARY KEY,
            originalName TEXT NOT NULL,
            storedFilename TEXT NOT NULL,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
} catch (e) {}

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            googleId TEXT UNIQUE,
            email TEXT UNIQUE,
            name TEXT,
            role TEXT DEFAULT 'user',
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
} catch (e) {
    console.error("Error creating users table", e);
}

try { db.exec(`ALTER TABLE jobs ADD COLUMN userId TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN creditsCost INTEGER`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN last_login DATETIME`); } catch (e) {}

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS feedback (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            jobId TEXT,
            rating INTEGER NOT NULL,
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
} catch (e) {
    console.error("Error creating feedback table", e);
}

try {
    db.exec(`ALTER TABLE feedback ADD COLUMN adminReply TEXT`);
} catch (e) {}
try {
    db.exec(`ALTER TABLE feedback ADD COLUMN isRead INTEGER DEFAULT 1`);
} catch (e) {}
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS payment_requests (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            slipImagePath TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            reviewed_at DATETIME
        )
    `);
} catch (e) {
    console.error("Error creating payment_requests table", e);
}

try { db.exec(`ALTER TABLE jobs ADD COLUMN coverText TEXT`); } catch (e) {}

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS reference_voices (
            id TEXT PRIMARY KEY,
            userId TEXT,
            name TEXT,
            audioPath TEXT,
            embeddingCachePath TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
} catch (e) {
    console.error("Error creating reference_voices table", e);
}

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ai_recap_jobs (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'processing',
            resultJson TEXT,
            error TEXT,
            createdAt INTEGER NOT NULL
        )
    `);
} catch (e) {
    console.error("Error creating ai_recap_jobs table", e);
}

try { db.exec(`ALTER TABLE ai_recap_jobs ADD COLUMN sourceVideoPath TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE ai_recap_jobs ADD COLUMN finalVideoPath TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE ai_recap_jobs ADD COLUMN generationStatus TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE ai_recap_jobs ADD COLUMN cleanedVideoPath TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE ai_recap_jobs ADD COLUMN videoCompletedAt INTEGER`); } catch (e) {}

try { db.exec(`ALTER TABLE jobs ADD COLUMN useVoiceClone INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN watermarkText TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN referenceVoiceId TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN voiceCloneDegraded INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN voiceCloneFallbackCount INTEGER DEFAULT 0`); } catch (e) {}

try { db.exec(`ALTER TABLE ai_recap_jobs ADD COLUMN progress REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE ai_recap_jobs ADD COLUMN currentStep TEXT`); } catch (e) {}
