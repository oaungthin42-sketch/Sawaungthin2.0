import fs from 'fs';
let content = fs.readFileSync('src/ai/index.js', 'utf8');

let newContent = content.replace(
    'export const initModels = async () => {',
`export const transcribeOriginalVideoWithAssemblyAI = async (audioPath, cachePath) => {
    // Just wrap transcribeWav, as the actual AssemblyAI logic is missing
    console.log('[AI] Running AssemblyAI transcription stage (using Whisper backend)...');
    return await transcribeWav(audioPath, cachePath);
};

export const initModels = async () => {`
);

fs.writeFileSync('src/ai/index.js', newContent);
