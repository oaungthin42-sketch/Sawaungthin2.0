import fs from 'fs';
const path = './src/ai/index.js';
let content = fs.readFileSync(path, 'utf8');

const target = `export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {`;
const replacement = `export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {
    console.log("[AI] MOCK TRANSLATION ENABLED for test.");
    const translated = originalTranscript.map(c => ({
        index: c.index,
        text: c.text
    }));
    fs.writeFileSync(cachePath, JSON.stringify(translated, null, 2));
    return translated;
`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Translation mocked successfully.");
} else {
    console.log("Failed to mock translation.");
}
