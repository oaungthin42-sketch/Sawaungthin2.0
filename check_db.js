import db from './src/services/db.js';
const rows = db.prepare('SELECT id, status, currentStep, error FROM jobs').all();
console.log(rows);
