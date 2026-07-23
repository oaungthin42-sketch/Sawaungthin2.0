const db = require('better-sqlite3')('data/jobs.db');
const rows = db.prepare("SELECT id, status, progress, currentStep FROM jobs").all();
console.log(JSON.stringify(rows[rows.length - 1], null, 2));
