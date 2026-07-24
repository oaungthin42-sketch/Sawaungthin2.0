const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const regexTTS = /state\.ttsAudioPath = await generateNarrationTTS\(state\.translatedTranscript, ttsAudioCache, voiceId, state\.originalTranscript\);/;
const newTTS = `const mappedTranscript = state.translatedTranscript.map(t => ({
                narration_text: t.text,
                scene_start: t.timestamp[0],
                scene_end: t.timestamp[1]
            }));
            state.ttsAudioPath = await generateNarrationTTS(mappedTranscript, ttsAudioCache, voiceId, state.originalTranscript);`;

content = content.replace(regexTTS, newTTS);

fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched tts audio param map');
