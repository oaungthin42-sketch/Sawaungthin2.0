import PQueue from 'p-queue';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import db from '../services/db.js';
import { getDuration } from '../ffmpeg/index.js';

// --- OpenVoice lazy start / idle shutdown (moved here from server.js) ---
// The service used to be spawned once at server boot and left running forever.
// It is now spawned on first use and torn down after a period of inactivity
// to free the RAM/PyTorch model when nobody is voice-cloning.
let openvoiceProcess = null;
let restartCount = 0;
let lastRestart = Date.now();
let lastUsedAt = 0;
let idleWatcherStarted = false;
let startingPromise = null;

const IDLE_TIMEOUT_MS = parseInt(process.env.VOICE_CLONE_IDLE_TIMEOUT_MS, 10) || 300000;

function spawnOpenVoiceProcess() {
    return new Promise(async (resolve) => {
        const { spawn } = await import('child_process');
        const pythonBin = process.env.PYTHON_BIN || (process.env.NODE_ENV === 'production' ? '/opt/venv/bin/python3' : 'python3');
        const pyScript = path.join(process.cwd(), 'src', 'ai', 'openvoice_service.py');
        console.log(`[OpenVoice] Starting service on-demand on port ${process.env.VOICE_CLONE_PORT || '5001'} using ${pythonBin}`);

        const proc = spawn(pythonBin, [pyScript], {
            env: {
                ...process.env,
                VOICE_CLONE_PORT: process.env.VOICE_CLONE_PORT || '5001'
            }
        });

        openvoiceProcess = proc;

        proc.stdout.on('data', (data) => {
            console.log(`[OpenVoice Service STDOUT] ${data.toString().trim()}`);
        });

        proc.stderr.on('data', (data) => {
            console.error(`[OpenVoice Service STDERR] ${data.toString().trim()}`);
        });

        proc.on('close', (code, signal) => {
            console.log(`[OpenVoice Service] Process exited with code ${code} and signal ${signal}`);
            if (openvoiceProcess === proc) openvoiceProcess = null;

            if (code === 0) {
                console.log(`[OpenVoice] Service gracefully disabled or exited cleanly. Not restarting.`);
                return;
            }

            if (signal === 'SIGTERM') {
                console.log(`[OpenVoice] Service stopped (idle shutdown or manual SIGTERM). Will restart on next request.`);
                return;
            }

            const now = Date.now();
            if (now - lastRestart > 5 * 60 * 1000) {
                restartCount = 0;
                lastRestart = now;
            }

            if (restartCount >= 5) {
                console.error(`[OpenVoice] CRITICAL: service crash-looping, giving up auto-restart`);
                return;
            }

            restartCount++;
            console.log(`[OpenVoice] Scheduling restart (${restartCount}/5) in 3000ms...`);
            setTimeout(() => spawnOpenVoiceProcess(), 3000);
        });

        resolve(proc);
    });
}

async function waitForOpenVoiceReady(timeoutMs = 180000) {
    const port = process.env.VOICE_CLONE_PORT || '5001';
    const healthUrl = `http://127.0.0.1:${port}/health`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (!openvoiceProcess) throw new Error('OpenVoice process is not running');
        try {
            const res = await axios.get(healthUrl, { timeout: 3000 });
            if (res.data && res.data.model_loaded) return true;
        } catch (e) {
            // not up yet, keep polling
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Timed out waiting for OpenVoice service to become ready');
}

function startIdleWatcher() {
    if (idleWatcherStarted) return;
    idleWatcherStarted = true;
    setInterval(() => {
        if (openvoiceProcess && (Date.now() - lastUsedAt) > IDLE_TIMEOUT_MS) {
            console.log(`[OpenVoice] Idle for over ${IDLE_TIMEOUT_MS}ms, shutting down to free memory.`);
            const proc = openvoiceProcess;
            openvoiceProcess = null;
            proc.kill('SIGTERM');
        }
    }, 30000);
}

/**
 * Ensures the OpenVoice python microservice is running, spawning it on first
 * use if needed, and waiting until it has finished loading its models.
 * No-op if VOICE_CLONE_ENABLED is not 'true'.
 */
export async function ensureOpenVoiceService() {
    if (process.env.VOICE_CLONE_ENABLED !== 'true') return;

    lastUsedAt = Date.now();
    startIdleWatcher();

    if (openvoiceProcess) {
        if (startingPromise) await startingPromise;
        return;
    }

    startingPromise = (async () => {
        await spawnOpenVoiceProcess();
        await waitForOpenVoiceReady();
    })();

    try {
        await startingPromise;
    } finally {
        startingPromise = null;
    }
}

/**
 * Applies voice cloning (timbre conversion) to a list of standardized chunk files.
 * Falls back to original chunk files if drift > 5% or if conversion fails.
 * 
 * @param {string[]} chunkWavPaths - Paths to the individual WAV chunks
 * @param {string} referenceVoiceId - Database ID of the selected reference voice
 * @returns {Promise<string[]>} - Paths to the final chunk files (cloned or original)
 */
export async function applyVoiceClone(chunkWavPaths, referenceVoiceId, options = {}) {
    const sourceMode = options.sourceMode || 'shared';
    console.log(`[VoiceClone] Starting voice conversion for ${chunkWavPaths?.length || 0} chunks using referenceVoiceId: ${referenceVoiceId} with sourceMode: ${sourceMode}`);
    
    if (!chunkWavPaths || chunkWavPaths.length === 0) {
        console.warn("[VoiceClone] No chunks provided for voice cloning.");
        return { chunks: chunkWavPaths || [], fallbackCount: 0, totalChunks: 0 };
    }

    try {
        const refVoice = db.prepare('SELECT * FROM reference_voices WHERE id = ?').get(referenceVoiceId);
        if (!refVoice) {
            console.error(`[VoiceClone] Reference voice not found in database for ID: ${referenceVoiceId}. Falling back to original EdgeTTS.`);
            return { chunks: chunkWavPaths, fallbackCount: chunkWavPaths.length, totalChunks: chunkWavPaths.length };
        }

        await ensureOpenVoiceService();

        const port = process.env.VOICE_CLONE_PORT || '5001';
        const serviceUrl = `http://127.0.0.1:${port}/convert`;
        const extractUrl = `http://127.0.0.1:${port}/extract-source-embedding`;

        // Sequential queue with concurrency 1
        const queue = new PQueue({ concurrency: 1 });
        const results = [];
        let fallbackCount = 0;
        
        // Pre-compute shared source embedding
        let sharedSourceEmbeddingPath = null;
        if (sourceMode === 'shared' && chunkWavPaths.length > 0) {
            // Get durations for all chunks to select the best candidate for embedding
            const durations = await Promise.all(chunkWavPaths.map(p => getDuration(p)));
            
            // Find the longest chunk
            let maxDuration = -1;
            let longestIdx = 0;
            for (let i = 0; i < durations.length; i++) {
                if (durations[i] > maxDuration) {
                    maxDuration = durations[i];
                    longestIdx = i;
                }
            }
            
            const longestPath = chunkWavPaths[longestIdx];
            console.log(`[VoiceClone] Selected chunk ${longestIdx} (duration: ${maxDuration.toFixed(2)}s) as source for shared embedding (longest of ${chunkWavPaths.length} chunks).`);

            sharedSourceEmbeddingPath = path.join(path.dirname(longestPath), 'source_embedding_shared.pt');
            console.log(`[VoiceClone] Pre-computing shared source embedding: ${sharedSourceEmbeddingPath}`);
            try {
                await axios.post(extractUrl, {
                    audio_path: path.resolve(longestPath),
                    cache_path: path.resolve(sharedSourceEmbeddingPath),
                    is_synthetic: true
                }, { timeout: 120000 }); // Longer timeout for initial extraction
            } catch (err) {
                console.error(`[VoiceClone] Failed to pre-compute source embedding: ${err.message}. Will compute per-chunk.`);
                sharedSourceEmbeddingPath = null;
            }
        }

        await queue.addAll(chunkWavPaths.map((chunkPath, idx) => async () => {
            try {
                if (!fs.existsSync(chunkPath)) {
                    console.warn(`[VoiceClone] Chunk file does not exist at path: ${chunkPath}. Using original path anyway.`);
                    fallbackCount++;
                    results.push(chunkPath);
                    return;
                }

                // Measure original duration
                const originalDuration = await getDuration(chunkPath);
                if (!Number.isFinite(originalDuration) || originalDuration <= 0) {
                    console.warn(`[VoiceClone] Could not get valid duration for chunk ${idx + 1}: ${chunkPath}. Falling back.`);
                    fallbackCount++;
                    results.push(chunkPath);
                    return;
                }

                const dir = path.dirname(chunkPath);
                const ext = path.extname(chunkPath);
                const base = path.basename(chunkPath, ext);
                const clonedChunkPath = path.join(dir, `${base}_cloned_${idx}${ext}`);

                const tauValue = parseFloat(process.env.VOICE_CLONE_TAU);
                const tau = !isNaN(tauValue) && tauValue >= 0.0 && tauValue <= 1.0 ? tauValue : 0.3;
                
                let activeSourceEmbeddingPath = null;
                if (sourceMode === 'shared') {
                    activeSourceEmbeddingPath = sharedSourceEmbeddingPath;
                } else if (sourceMode === 'per_chunk') {
                    activeSourceEmbeddingPath = path.join(dir, `${base}_source_embedding.pt`);
                    try {
                        console.log(`[VoiceClone] Pre-computing per-chunk source embedding for ${chunkPath}`);
                        await axios.post(extractUrl, {
                            audio_path: path.resolve(chunkPath),
                            cache_path: path.resolve(activeSourceEmbeddingPath),
                            is_synthetic: true
                        }, { timeout: 90000 });
                    } catch (err) {
                        console.error(`[VoiceClone] Failed to compute per-chunk source embedding: ${err.message}.`);
                        activeSourceEmbeddingPath = null;
                    }
                }

                console.log(`[VoiceClone] Sending chunk ${idx + 1}/${chunkWavPaths.length} to Python microservice: ${chunkPath} with tau=${tau}`);

                const response = await axios.post(serviceUrl, {
                    source_audio_path: path.resolve(chunkPath),
                    source_embedding_path: activeSourceEmbeddingPath ? path.resolve(activeSourceEmbeddingPath) : null,
                    reference_embedding_path: refVoice.embeddingCachePath ? path.resolve(refVoice.embeddingCachePath) : null,
                    reference_audio_path: refVoice.audioPath ? path.resolve(refVoice.audioPath) : null,
                    output_path: path.resolve(clonedChunkPath),
                    tau: tau
                }, { timeout: 90000 }); // 90 seconds timeout per chunk

                if (response.data && response.data.status === 'success' && fs.existsSync(clonedChunkPath)) {
                    // Check duration drift
                    const clonedDuration = await getDuration(clonedChunkPath);
                    const drift = Math.abs(clonedDuration - originalDuration) / originalDuration;

                    if (drift > 0.05) {
                        console.warn(`[VoiceClone] WARNING: Drift of ${(drift * 100).toFixed(2)}% on chunk ${idx + 1} exceeds 5% limit! Falling back to original chunk.`);
                        try { fs.unlinkSync(clonedChunkPath); } catch (unlinkErr) {}
                        fallbackCount++;
                        results.push(chunkPath);
                    } else {
                        console.log(`[VoiceClone] Successfully cloned chunk ${idx + 1} with drift: ${(drift * 100).toFixed(2)}%`);
                        results.push(clonedChunkPath);
                    }
                } else {
                    console.warn(`[VoiceClone] Microservice did not return success for chunk ${idx + 1}. Falling back to original chunk.`);
                    fallbackCount++;
                    results.push(chunkPath);
                }
            } catch (err) {
                console.error(`[VoiceClone] Error converting chunk ${idx + 1}: ${err.message}. Falling back to original chunk.`);
                fallbackCount++;
                results.push(chunkPath);
            }
        }));

        console.log("[VoiceClone] Finished voice cloning process.");
        return { chunks: results, fallbackCount, totalChunks: chunkWavPaths.length };
    } catch (e) {
        console.error("[VoiceClone] Unexpected error in applyVoiceClone module:", e);
        return { chunks: chunkWavPaths, fallbackCount: chunkWavPaths.length, totalChunks: chunkWavPaths.length };
    }
}
