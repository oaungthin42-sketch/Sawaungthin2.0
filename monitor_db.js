import db from './src/services/db.js';
let lastIds = new Set();
setInterval(() => {
    const rows = db.prepare('SELECT id, status, currentStep, progress, error FROM jobs').all();
    for (const row of rows) {
        if (!lastIds.has(row.id)) {
            console.log(`[NEW] ${row.id}: ${row.status} - ${row.currentStep}`);
            lastIds.add(row.id);
        }
        if (row.status === 'error') {
            console.log(`[ERROR] ${row.id}: ${row.error}`);
            lastIds.add(row.id);
        }
    }
}, 5000);
