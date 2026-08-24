import db from './db.js';
import fs from 'fs';
import path from 'path';

export const startCleanupSweep = () => {
    const sweep = () => {
        try {
            const timeLimit = Date.now() - 4 * 60 * 60 * 1000;
            const stmt = db.prepare(`SELECT id FROM jobs WHERE status = 'complete' AND completed_at IS NOT NULL AND completed_at < ?`);
            const expiredJobs = stmt.all(timeLimit);

            if (expiredJobs.length > 0) {
                console.log(`[Cleanup] Found ${expiredJobs.length} expired completed jobs.`);
            }

            for (const job of expiredJobs) {
                const jobId = job.id;
                let freedBytes = 0;

                const outputPath = path.join(process.cwd(), 'data', 'output', `${jobId}.mp4`);
                try {
                    if (fs.existsSync(outputPath)) {
                        const stat = fs.statSync(outputPath);
                        freedBytes += stat.size;
                        fs.unlinkSync(outputPath);
                    }
                } catch (e) {
                    console.error(`[Cleanup] Failed to delete output for ${jobId}:`, e);
                }

                const cacheDir = path.join(process.cwd(), 'data', 'cache', jobId);
                try {
                    if (fs.existsSync(cacheDir)) {
                        fs.rmSync(cacheDir, { recursive: true, force: true });
                    }
                } catch (e) {
                    console.error(`[Cleanup] Failed to delete cache for ${jobId}:`, e);
                }

                try {
                    const deleteStmt = db.prepare(`DELETE FROM jobs WHERE id = ?`);
                    deleteStmt.run(jobId);
                    console.log(`[Cleanup] Successfully swept job ${jobId}. Freed ~${(freedBytes / 1024 / 1024).toFixed(2)} MB.`);
                } catch (e) {
                    console.error(`[Cleanup] Failed to delete DB row for ${jobId}:`, e);
                }
            }

            const recapTimeLimit = Date.now() - 4 * 60 * 60 * 1000;
            const recapStmt = db.prepare(`SELECT id, sourceVideoPath, finalVideoPath, cleanedVideoPath FROM ai_recap_jobs WHERE (generationStatus = 'video_done' OR generationStatus = 'video_error') AND videoCompletedAt IS NOT NULL AND videoCompletedAt < ?`);
            const expiredRecaps = recapStmt.all(recapTimeLimit);

            if (expiredRecaps.length > 0) {
                console.log(`[Cleanup] Found ${expiredRecaps.length} expired AI Recap jobs.`);
            }

            for (const recap of expiredRecaps) {
                const jobId = recap.id;
                let freedBytes = 0;

                try {
                    if (recap.finalVideoPath && fs.existsSync(recap.finalVideoPath)) {
                        const stat = fs.statSync(recap.finalVideoPath);
                        freedBytes += stat.size;
                        fs.unlinkSync(recap.finalVideoPath);
                    }
                    if (recap.sourceVideoPath && fs.existsSync(recap.sourceVideoPath)) {
                        const stat = fs.statSync(recap.sourceVideoPath);
                        freedBytes += stat.size;
                        fs.unlinkSync(recap.sourceVideoPath);
                    }
                    if (recap.cleanedVideoPath && fs.existsSync(recap.cleanedVideoPath)) {
                        const stat = fs.statSync(recap.cleanedVideoPath);
                        freedBytes += stat.size;
                        fs.unlinkSync(recap.cleanedVideoPath);
                    }
                } catch (e) {
                    console.error(`[Cleanup] Failed to delete files for AI Recap ${jobId}:`, e);
                }

                try {
                    const deleteStmt = db.prepare(`DELETE FROM ai_recap_jobs WHERE id = ?`);
                    deleteStmt.run(jobId);
                    console.log(`[Cleanup] Successfully swept AI Recap job ${jobId}. Freed ~${(freedBytes / 1024 / 1024).toFixed(2)} MB.`);
                } catch (e) {
                    console.error(`[Cleanup] Failed to delete DB row for AI Recap ${jobId}:`, e);
                }
            }

        } catch (e) {
            console.error(`[Cleanup] Sweep failed:`, e);
        }
    };

    sweep();
    setInterval(sweep, 30 * 60 * 1000);
};
