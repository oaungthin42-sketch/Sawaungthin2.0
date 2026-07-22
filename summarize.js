import db from './src/services/db.js';

const rows = db.prepare('SELECT id, status, currentStep, error FROM jobs').all();
for (const r of rows) {
    if (r.status === 'complete' || r.status === 'error') {
       console.log(`Job ${r.id}: ${r.status} (Step: ${r.currentStep}) - ${r.error ? r.error.substring(0,100) : 'Success'}`);
    }
}
