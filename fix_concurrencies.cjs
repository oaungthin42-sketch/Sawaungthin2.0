const fs = require('fs');

const ttsFile = 'src/ai/index.js';
let ttsContent = fs.readFileSync(ttsFile, 'utf8');
ttsContent = ttsContent.replace(
  /const concurrencyLimit = process\.env\.TTS_CONCURRENCY \? parseInt\(process\.env\.TTS_CONCURRENCY, 10\) : 3;/,
  `let concurrencyLimit = 3;
        if (process.env.TTS_CONCURRENCY) {
            const parsed = parseInt(process.env.TTS_CONCURRENCY, 10);
            if (Number.isFinite(parsed) && parsed >= 1) {
                concurrencyLimit = Math.min(parsed, 20);
            }
        }`
);
fs.writeFileSync(ttsFile, ttsContent);

const procFile = 'src/workers/processor.js';
let procContent = fs.readFileSync(procFile, 'utf8');
procContent = procContent.replace(
  /const limit = process\.env\.SEGMENT_CONCURRENCY \? parseInt\(process\.env\.SEGMENT_CONCURRENCY, 10\) : 3;/,
  `let limit = 3;
            if (process.env.SEGMENT_CONCURRENCY) {
                const parsed = parseInt(process.env.SEGMENT_CONCURRENCY, 10);
                if (Number.isFinite(parsed) && parsed >= 1) {
                    limit = Math.min(parsed, 20);
                }
            }`
);
procContent = procContent.replace(
  /const limit = process\.env\.SEGMENT_CONCURRENCY \? parseInt\(process\.env\.SEGMENT_CONCURRENCY, 10\) : 5;/,
  `let limit = 5;
                if (process.env.SEGMENT_CONCURRENCY) {
                    const parsed = parseInt(process.env.SEGMENT_CONCURRENCY, 10);
                    if (Number.isFinite(parsed) && parsed >= 1) {
                        limit = Math.min(parsed, 20);
                    }
                }`
);
fs.writeFileSync(procFile, procContent);
