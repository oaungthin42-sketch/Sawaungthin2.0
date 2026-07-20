import db from './db.js';

const jobKeys = new Map();

export const setJobKeys = (id, keys) => {
    jobKeys.set(id, keys);
};

export const getJobKeys = (id) => {
    return jobKeys.get(id) || {};
};

export const clearJobKeys = (id) => {
    jobKeys.delete(id);
};

export const createJob = (id, data) => {
    const stmt = db.prepare(`
        INSERT INTO jobs (id, videoPath, audioPath, status, progress, currentStep, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.videoPath, data.audioPath, 'uploading', 0, 'Upload', Date.now());
    return getJob(id);
};

export const getJob = (id) => {
    const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    if (row.result) row.result = JSON.parse(row.result);
    return row;
};

export const updateJob = (id, updates) => {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => {
        if (k === 'result') return JSON.stringify(updates[k]);
        return updates[k];
    });
    
    const stmt = db.prepare(`UPDATE jobs SET ${setClause} WHERE id = ?`);
    stmt.run(...values, id);
};

export const recoverStuckJobs = () => {
    const stmt = db.prepare(`
        UPDATE jobs 
        SET status = 'error', error = 'Job interrupted due to server restart.' 
        WHERE status IN ('processing', 'pending', 'uploading')
    `);
    stmt.run();
    console.log('[JobManager] Recovered stuck jobs by marking them as error.');
};
