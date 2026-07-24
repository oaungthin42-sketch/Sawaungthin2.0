const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const regexImport = /import \{ transcribeWav, computeSimilarity, generateSceneNarration, generateNarrationTTS \} from '\.\.\/ai\/index\.js';/;
const newImport = "import { transcribeWav, computeSimilarity, translateWithGemini, generateNarrationTTS } from '../ai/index.js';";

content = content.replace(regexImport, newImport);

const regexTranscript = /advanceStep\(STEPS\.TRANSCRIPT_ORIGINAL, 25, 'Skipping Original Transcript \(Scene Mode\)'\);\s*state\.originalTranscript = \[\];/;
const newTranscript = `advanceStep(STEPS.TRANSCRIPT_ORIGINAL, 25, 'Transcribing Original Audio');
            state.originalTranscript = await transcribeWav(videoWavPath, vidTranscriptCache);`;

content = content.replace(regexTranscript, newTranscript);

const regexTranslate = /advanceStep\(STEPS\.TRANSLATE_BURMESE, 30, 'Generating Scene Narration'\);\s*state\.sceneNarration = await generateSceneNarration\(state\.scenes, job\.videoPath, geminiApiKey\);\s*if \(!Array\.isArray\(state\.sceneNarration\) \|\| state\.sceneNarration\.length !== state\.scenes\.length\) \{\s*throw new Error\("Pipeline Error: sceneNarration length mismatch or invalid\."\);\s*\}/;
const newTranslate = `advanceStep(STEPS.TRANSLATE_BURMESE, 30, 'Translating to Burmese');
            state.translatedTranscript = await translateWithGemini(state.originalTranscript, translatedTranscriptCache, geminiApiKey);`;

content = content.replace(regexTranslate, newTranslate);

const regexTTS = /state\.ttsAudioPath = await generateNarrationTTS\(state\.sceneNarration, ttsAudioCache, voiceId\);/;
const newTTS = `state.ttsAudioPath = await generateNarrationTTS(state.translatedTranscript, ttsAudioCache, voiceId, state.originalTranscript);`;

content = content.replace(regexTTS, newTTS);

fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched processor');
