import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const cleanupBlockOld = `        try {
            if (fs.existsSync(cacheDir)) {
                fs.rmSync(cacheDir, { recursive: true, force: true });
            }
            if (job && job.videoPath && fs.existsSync(job.videoPath)) fs.unlinkSync(job.videoPath);
            if (job && job.audioPath && fs.existsSync(job.audioPath)) fs.unlinkSync(job.audioPath);
        } catch (cleanupErr) {
            console.error(\`[Job \${jobId}] Cleanup Error:\`, cleanupErr);
        }`;

const cleanupBlockNew = `        try {
            const filesToRemove = [
                path.join(cacheDir, 'video.wav'),
                path.join(cacheDir, 'audio.wav'),
                path.join(cacheDir, 'concat.txt')
            ];
            
            if (fs.existsSync(cacheDir)) {
                const ttsChunksDir = path.join(cacheDir, 'tts_chunks');
                if (fs.existsSync(ttsChunksDir)) fs.rmSync(ttsChunksDir, { recursive: true, force: true });
                
                try {
                    const segFiles = fs.readdirSync(cacheDir).filter(f => f.startsWith('seg_') && f.endsWith('.mp4'));
                    for (const sf of segFiles) {
                        filesToRemove.push(path.join(cacheDir, sf));
                    }
                } catch(e) {}
            }
            
            if (job && job.videoPath) filesToRemove.push(job.videoPath);
            if (job && job.audioPath) filesToRemove.push(job.audioPath);

            for (const f of filesToRemove) {
                if (fs.existsSync(f)) {
                    try { fs.unlinkSync(f); } catch (e) {}
                }
            }
        } catch (cleanupErr) {
            console.error(\`[Job \${jobId}] Cleanup Error:\`, cleanupErr);
        }`;

content = content.replace(cleanupBlockOld, cleanupBlockNew);

// API Key Sanitization for error
const errorBlockOld = `        updateJob(jobId, { status: 'error', error: err.message });`;
const errorBlockNew = `        const safeErrorMsg = err.message ? err.message.replace(/key=[A-Za-z0-9_\\-]+/gi, 'key=HIDDEN') : 'Unknown error';
        updateJob(jobId, { status: 'error', error: safeErrorMsg });`;
content = content.replace(errorBlockOld, errorBlockNew);

fs.writeFileSync('src/workers/processor.js', content);
