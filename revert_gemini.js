import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /export const translateWithGemini = async \(originalTranscript, cachePath, apiKey = null\) => \{\n    if \(apiKey === 'bypass'\) \{\n        console.log\('\[AI\] Bypassing Gemini translation for tests'\);\n        const fakeTranslation = originalTranscript.map\(chunk => \(\{ timestamp: chunk.timestamp, text: "Translated: " \+ chunk.text \}\)\);\n        if \(cachePath\) fs.writeFileSync\(cachePath, JSON.stringify\(fakeTranslation\)\);\n        return fakeTranslation;\n    \}/g;

const replacement = `export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {`;
content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Reverted Gemini bypass');
