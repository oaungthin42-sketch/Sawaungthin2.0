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

try { db.exec(`ALTER TABLE users ADD COLUMN geminiApiKeyEncrypted TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE jobs ADD COLUMN userId TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 3`); } catch (e) {}

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
