import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const target = "state.ttsAudioPath = await generateNarrationTTS(state.translatedTranscript, ttsAudioCache, voiceId);";
const replacement = "state.ttsAudioPath = await generateNarrationTTS(state.translatedTranscript, ttsAudioCache, voiceId, state.originalTranscript);";

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Patched processor.js successfully.");
} else {
    console.log("Target not found in processor.js");
}
