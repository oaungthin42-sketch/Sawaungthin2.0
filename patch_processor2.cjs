const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const regex = /for \(let i = 0; i < authTimeline\.length; i\+\+\) \{[\s\S]*?\}\n\n            if \(current_time < state\.audioDuration\)/;

const newLoop = `for (let i = 0; i < state.sceneNarration.length; i++) {
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
            }

            if (current_time < state.audioDuration)`;

content = content.replace(regex, newLoop);

fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched processor.js again');
