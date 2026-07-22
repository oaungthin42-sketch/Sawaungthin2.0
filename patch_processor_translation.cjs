const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /if \(\!Array\.isArray\(state\.translatedTranscript\) \|\| state\.translatedTranscript\.length === 0\) \{[\s\S]*?throw new Error\("Pipeline Error: translatedTranscript is empty or invalid after Gemini translation\."\);[\s\S]*?\}/m;

const replacement = `if (!Array.isArray(state.translatedTranscript)) {
                throw new Error("Pipeline Error: translatedTranscript is invalid after Gemini translation.");
            }
            if (state.translatedTranscript.length === 0) {
                console.warn("[WARNING] translatedTranscript is empty! Continuing with empty audio timeline.");
            }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched processor to allow empty translated transcripts');
