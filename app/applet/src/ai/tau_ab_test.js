import fs from 'fs';
import path from 'path';
import axios from 'axios';
import db from '../services/db.js';

const taus = [0.20, 0.22, 0.25, 0.30];

async function runABTest() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log("Usage: node src/ai/tau_ab_test.js <path_to_chunk_wav> <reference_voice_id>");
        console.log("Example: node src/ai/tau_ab_test.js /path/to/chunk_std_0.wav 1");
        process.exit(1);
    }

    const chunkPath = path.resolve(args[0]);
    const refVoiceId = args[1];

    if (!fs.existsSync(chunkPath)) {
        console.error(`[Error] Input chunk not found: ${chunkPath}`);
        process.exit(1);
    }

    const refVoice = db.prepare('SELECT * FROM reference_voices WHERE id = ?').get(refVoiceId);
    if (!refVoice) {
        console.error(`[Error] Reference voice ID ${refVoiceId} not found in database.`);
        process.exit(1);
    }

    const outputDir = '/tmp/tau_ab_test';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const port = process.env.VOICE_CLONE_PORT || '5001';
    const convertUrl = `http://127.0.0.1:${port}/convert`;

    console.log(`Starting Tau A/B Test...`);
    console.log(`Source Chunk: ${chunkPath}`);
    console.log(`Reference Voice ID: ${refVoiceId}`);
    console.log(`Output Directory: ${outputDir}\n`);

    for (const tau of taus) {
        const outFileName = `cloned_tau_${tau.toFixed(2)}.wav`;
        const outPath = path.join(outputDir, outFileName);

        console.log(`[Tau ${tau.toFixed(2)}] Requesting conversion...`);
        try {
            const response = await axios.post(convertUrl, {
                source_audio_path: chunkPath,
                reference_embedding_path: refVoice.embeddingCachePath ? path.resolve(refVoice.embeddingCachePath) : null,
                reference_audio_path: refVoice.audioPath ? path.resolve(refVoice.audioPath) : null,
                output_path: outPath,
                tau: tau
            }, { timeout: 120000 });

            if (response.data && response.data.status === 'success' && fs.existsSync(outPath)) {
                console.log(`[Tau ${tau.toFixed(2)}] ✅ Success -> ${outPath}`);
            } else {
                console.error(`[Tau ${tau.toFixed(2)}] ❌ Conversion failed or file missing.`);
            }
        } catch (err) {
            console.error(`[Tau ${tau.toFixed(2)}] ❌ Error: ${err.message}`);
        }
    }

    console.log(`\nFinished! Please review the files in ${outputDir} to determine the best tau value.`);
}

runABTest().catch(console.error);
