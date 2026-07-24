const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

// 1. Update imports
content = content.replace(/import \{ transcribeWav, computeSimilarity, translateWithGemini, generateNarrationTTS \} from '\.\.\/ai\/index\.js';/, 
"import { transcribeWav, computeSimilarity, generateSceneNarration, generateNarrationTTS } from '../ai/index.js';");

// 2. We don't need TRANSCRIPT_ORIGINAL anymore, but let's just leave it or replace it.
// To keep things simple and safe, I will comment out the whisper transcribe logic but keep the step so job progression doesn't break.
content = content.replace(
/if \(!hasCompletedStep\(job\.currentStep, STEPS\.TRANSCRIPT_ORIGINAL\)\) \{[\s\S]*?saveState\(\);\n        \}/,
`if (!hasCompletedStep(job.currentStep, STEPS.TRANSCRIPT_ORIGINAL)) {
            advanceStep(STEPS.TRANSCRIPT_ORIGINAL, 25, 'Skipping Original Transcript (Scene Mode)');
            state.originalTranscript = [];
            saveState();
        }`
);

// 3. Replace TRANSLATE_BURMESE logic
content = content.replace(
/if \(!hasCompletedStep\(job\.currentStep, STEPS\.TRANSLATE_BURMESE\)\) \{[\s\S]*?saveState\(\);\n        \}/,
`if (!hasCompletedStep(job.currentStep, STEPS.TRANSLATE_BURMESE)) {
            advanceStep(STEPS.TRANSLATE_BURMESE, 30, 'Generating Scene Narration');
            state.sceneNarration = await generateSceneNarration(state.scenes, job.videoPath, geminiApiKey);
            
            if (!Array.isArray(state.sceneNarration) || state.sceneNarration.length !== state.scenes.length) {
                throw new Error("Pipeline Error: sceneNarration length mismatch or invalid.");
            }
            saveState();
        }`
);

// 4. Update GENERATE_TTS
content = content.replace(
/state\.ttsAudioPath = await generateNarrationTTS\(state\.translatedTranscript, ttsAudioCache, voiceId, state\.originalTranscript\);/,
`state.ttsAudioPath = await generateNarrationTTS(state.sceneNarration, ttsAudioCache, voiceId);`
);

// 5. Update TIMELINE_BUILDER
const oldTimelineLogicRegex = /for \(let i = 0; i < authTimeline\.length; i\+\+\) \{[\s\S]*?current_time = c_end;\n            \}/;

const newTimelineLogic = `for (let i = 0; i < state.sceneNarration.length; i++) {
                const sceneItem = state.sceneNarration[i];
                const chunk = authTimeline[i];
                
                if (!chunk) {
                    throw new Error(\`Pipeline Error: Missing authTimeline chunk for scene \${i}\`);
                }
                
                let c_start = chunk.final_audio_start;
                let c_end = chunk.final_audio_end;
                
                let scene_start = sceneItem.scene_start;
                let scene_end = sceneItem.scene_end;
                
                createTimelineSegment(c_start, c_end, scene_start, scene_end, sceneItem.narration_text);
                
                state.mapping.push({
                    text: sceneItem.narration_text,
                    timestamp: [c_start, c_end]
                });
                
                current_time = c_end;
            }`;

content = content.replace(oldTimelineLogicRegex, newTimelineLogic);

fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched processor.js');
