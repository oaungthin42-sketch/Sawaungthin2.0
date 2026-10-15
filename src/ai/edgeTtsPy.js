import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = process.env.EDGE_TTS_PYTHON || '/opt/venv/bin/python3';
const SCRIPT_PATH = path.join(__dirname, 'edge_tts_cli.py');

export const edgeTtsToFile = (text, options, outPath, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const { voice, rate, pitch } = options || {};
    const textPath = `${outPath}.input.txt`;
    try {
        fs.writeFileSync(textPath, text, 'utf8');
    } catch (writeErr) {
        return reject(writeErr);
    }
    execFile(
        PYTHON_BIN,
        [SCRIPT_PATH, voice, rate || '+0%', pitch || '+0Hz', textPath, outPath],
        { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
            try { fs.unlinkSync(textPath); } catch (_) {}
            if (err) {
                const detail = (stderr || '').toString().trim().split('\n').slice(-3).join(' | ') || err.message;
                return reject(new Error(`edge-tts (python) failed: ${detail}`));
            }
            resolve(outPath);
        }
    );
});
