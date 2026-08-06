import PQueue from 'p-queue';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import db from '../services/db.js';
import { getDuration } from '../ffmpeg/index.js';

/**
 * Applies voice cloning (timbre conversion) to a list of standardized chunk files.
 * Falls back to original chunk files if drift > 5% or if conversion fails.
 * 
 * @param {string[]} chunkWavPaths - Paths to the individual WAV chunks
 * @param {string} referenceVoiceId - Database ID of the selected reference voice
 * @returns {Promise<string[]>} - Paths to the final chunk files (cloned or original)
 */
export async function applyVoiceClone(chunkWavPaths, referenceVoiceId) {
    console.log(`[VoiceClone] Starting voice conversion for ${chunkWavPaths?.length || 0} chunks using referenceVoiceId: ${referenceVoiceId}`);
    
    if (!chunkWavPaths || chunkWavPaths.length === 0) {
        console.warn("[VoiceClone] No chunks provided for voice cloning.");
        return chunkWavPaths || [];
    }

    try {
        const refVoice = db.prepare('SELECT * FROM reference_voices WHERE id = ?').get(referenceVoiceId);
        if (!refVoice) {
            console.error(`[VoiceClone] Reference voice not found in database for ID: ${referenceVoiceId}. Falling back to original EdgeTTS.`);
            return chunkWavPaths;
        }

        const port = process.env.VOICE_CLONE_PORT || '5001';
        const serviceUrl = `http://127.0.0.1:${port}/convert`;
        const extractUrl = `http://127.0.0.1:${port}/extract-source-embedding`;

        // Sequential queue with concurrency 1
        const queue = new PQueue({ concurrency: 1 });
        const results = [];
        
        // Pre-compute shared source embedding
        let sharedSourceEmbeddingPath = null;
        if (chunkWavPaths.length > 0) {
            sharedSourceEmbeddingPath = path.join(path.dirname(chunkWavPaths[0]), 'source_embedding_shared.pt');
            console.log(`[VoiceClone] Pre-computing shared source embedding: ${sharedSourceEmbeddingPath}`);
            try {
                await axios.post(extractUrl, {
                    audio_path: path.resolve(chunkWavPaths[0]),
                    cache_path: path.resolve(sharedSourceEmbeddingPath)
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
                    results.push(chunkPath);
                    return;
                }

                // Measure original duration
                const originalDuration = await getDuration(chunkPath);
                if (!Number.isFinite(originalDuration) || originalDuration <= 0) {
                    console.warn(`[VoiceClone] Could not get valid duration for chunk ${idx + 1}: ${chunkPath}. Falling back.`);
                    results.push(chunkPath);
                    return;
                }

                const dir = path.dirname(chunkPath);
                const ext = path.extname(chunkPath);
                const base = path.basename(chunkPath, ext);
                const clonedChunkPath = path.join(dir, `${base}_cloned_${idx}${ext}`);

                console.log(`[VoiceClone] Sending chunk ${idx + 1}/${chunkWavPaths.length} to Python microservice: ${chunkPath}`);

                const response = await axios.post(serviceUrl, {
                    source_audio_path: path.resolve(chunkPath),
                    source_embedding_path: sharedSourceEmbeddingPath ? path.resolve(sharedSourceEmbeddingPath) : null,
                    reference_embedding_path: refVoice.embeddingCachePath ? path.resolve(refVoice.embeddingCachePath) : null,
                    reference_audio_path: refVoice.audioPath ? path.resolve(refVoice.audioPath) : null,
                    output_path: path.resolve(clonedChunkPath)
                }, { timeout: 90000 }); // 90 seconds timeout per chunk

                if (response.data && response.data.status === 'success' && fs.existsSync(clonedChunkPath)) {
                    // Check duration drift
                    const clonedDuration = await getDuration(clonedChunkPath);
                    const drift = Math.abs(clonedDuration - originalDuration) / originalDuration;

                    if (drift > 0.05) {
                        console.warn(`[VoiceClone] WARNING: Drift of ${(drift * 100).toFixed(2)}% on chunk ${idx + 1} exceeds 5% limit! Falling back to original chunk.`);
                        try { fs.unlinkSync(clonedChunkPath); } catch (unlinkErr) {}
                        results.push(chunkPath);
                    } else {
                        console.log(`[VoiceClone] Successfully cloned chunk ${idx + 1} with drift: ${(drift * 100).toFixed(2)}%`);
                        results.push(clonedChunkPath);
                    }
                } else {
                    console.warn(`[VoiceClone] Microservice did not return success for chunk ${idx + 1}. Falling back to original chunk.`);
                    results.push(chunkPath);
                }
            } catch (err) {
                console.error(`[VoiceClone] Error converting chunk ${idx + 1}: ${err.message}. Falling back to original chunk.`);
                results.push(chunkPath);
            }
        }));

        console.log("[VoiceClone] Finished voice cloning process.");
        return results;
    } catch (e) {
        console.error("[VoiceClone] Unexpected error in applyVoiceClone module:", e);
        return chunkWavPaths;
    }
}
