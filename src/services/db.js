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
    created_at INTEGER
  );
`);

export default db;
