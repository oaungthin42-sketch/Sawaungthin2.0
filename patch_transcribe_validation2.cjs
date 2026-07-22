const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

// Also need to allow empty transcripts. If the length is 0, just resolve it instead of erroring in processor.
const regex = /if \(\!Array\.isArray\(state\.originalTranscript\) \|\| state\.originalTranscript\.length === 0\) \{[\s\S]*?throw new Error\("Pipeline Error: originalTranscript is empty or invalid after Whisper transcription\."\);[\s\S]*?\}/m;

const replacement = `if (!Array.isArray(state.originalTranscript)) {
                throw new Error("Pipeline Error: originalTranscript is invalid after Whisper transcription.");
            }
            if (state.originalTranscript.length === 0) {
                console.warn("[WARNING] originalTranscript is empty! Whisper returned no speech.");
            }`;

const file2 = path.join(__dirname, 'src/workers/processor.js');
let content2 = fs.readFileSync(file2, 'utf8');
content2 = content2.replace(regex, replacement);
fs.writeFileSync(file2, content2);
console.log('Patched processor to allow empty transcripts');
