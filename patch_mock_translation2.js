import fs from 'fs';
const path = './src/ai/index.js';
let content = fs.readFileSync(path, 'utf8');

const target = `    const translated = originalTranscript.map(c => ({
        index: c.index,
        text: c.text
    }));`;
const replacement = `    const translated = originalTranscript.map(c => ({
        index: c.index,
        text: c.text,
        timestamp: c.timestamp,
        is_dialogue: c.is_dialogue || false
    }));`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Translation mocked successfully with timestamp.");
} else {
    console.log("Failed to patch mock translation.");
}
