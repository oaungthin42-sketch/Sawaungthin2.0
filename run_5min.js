import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createJob, setJobKeys } from './src/services/jobManager.js';
import { addJobToQueue } from './src/services/queue.js';
import db from './src/services/db.js';

const id = uuidv4();
const originalVideo = path.resolve('data/test_300s.mp4');
const videoPath = path.resolve('data/cache/test_300s_' + id + '.mp4');
if (!fs.existsSync(originalVideo)) {
    console.error("Test file not found: " + originalVideo);
    process.exit(1);
}
fs.mkdirSync(path.dirname(videoPath), { recursive: true });
fs.copyFileSync(originalVideo, videoPath);

setJobKeys(id, { geminiApiKey: process.env.GEMINI_API_KEY });
createJob(id, { videoPath });
addJobToQueue(id);

console.log('Started job:', id);

let lastProgress = 0;
const startMs = Date.now();
const interval = setInterval(() => {
    const stmt = db.prepare('SELECT status, progress, currentStep, error FROM jobs WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return;

    if (row.progress !== lastProgress || row.status === 'error' || row.status === 'complete') {
        console.log(`[${row.status}] Step: ${row.currentStep} | Progress: ${row.progress}%`);
        lastProgress = row.progress;
    }

    if (row.status === 'error') {
        console.error('ERROR:', row.error);
        clearInterval(interval);
        process.exit(1);
    }

    if (row.status === 'complete') {
        console.log(`SUCCESS in ${((Date.now() - startMs) / 1000).toFixed(2)}s`);
        clearInterval(interval);
        process.exit(0);
    }
}, 1000);
