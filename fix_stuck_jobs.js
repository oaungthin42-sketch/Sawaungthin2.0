import fs from 'fs';

let dbContent = fs.readFileSync('src/services/jobManager.js', 'utf8');
if (!dbContent.includes('recoverStuckJobs')) {
    dbContent += `
export const recoverStuckJobs = () => {
    const stmt = db.prepare(\`
        UPDATE jobs 
        SET status = 'error', error = 'Job interrupted due to server restart.' 
        WHERE status IN ('processing', 'pending', 'uploading')
    \`);
    stmt.run();
    console.log('[JobManager] Recovered stuck jobs by marking them as error.');
};
`;
    fs.writeFileSync('src/services/jobManager.js', dbContent);
}

let serverContent = fs.readFileSync('server.js', 'utf8');
if (!serverContent.includes('recoverStuckJobs')) {
    serverContent = serverContent.replace(
        "import { initModels } from './src/ai/index.js';",
        "import { initModels } from './src/ai/index.js';\nimport { recoverStuckJobs } from './src/services/jobManager.js';"
    );
    serverContent = serverContent.replace(
        'async function startServer() {',
        'async function startServer() {\n  recoverStuckJobs();'
    );
    fs.writeFileSync('server.js', serverContent);
}
