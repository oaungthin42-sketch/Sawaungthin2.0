const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const regex = /state\.mapping = \[\];\s*for \(let i = 0; i < authTimeline\.length; i\+\+\) \{[\s\S]*?current_time = c_end;\s*\}/;

const replacement = `state.mapping = [];
            
            const mergedGroups = [];
            let currentGroup = null;

            for (let i = 0; i < authTimeline.length; i++) {
                const chunk = authTimeline[i];
                
                if (!chunk) {
                    throw new Error(\`Pipeline Error: Missing authTimeline chunk for scene \${i}\`);
                }

                state.mapping.push({
                    text: chunk.text,
                    timestamp: [chunk.final_audio_start, chunk.final_audio_end]
                });

                if (!currentGroup) {
                    currentGroup = {
                        text: chunk.text,
                        orig_start: chunk.orig_start,
                        orig_end: chunk.orig_end,
                        final_audio_start: chunk.final_audio_start,
                        final_audio_end: chunk.final_audio_end
                    };
                } else {
                    const gap = chunk.orig_start - currentGroup.orig_end;
                    const proposedDuration = chunk.orig_end - currentGroup.orig_start;
                    
                    if (gap < 0.75 && proposedDuration <= 12) {
                        currentGroup.text += " " + chunk.text;
                        currentGroup.orig_end = chunk.orig_end;
                        currentGroup.final_audio_end = chunk.final_audio_end;
                    } else {
                        mergedGroups.push(currentGroup);
                        currentGroup = {
                            text: chunk.text,
                            orig_start: chunk.orig_start,
                            orig_end: chunk.orig_end,
                            final_audio_start: chunk.final_audio_start,
                            final_audio_end: chunk.final_audio_end
                        };
                    }
                }
            }
            
            if (currentGroup) {
                mergedGroups.push(currentGroup);
            }

            for (const group of mergedGroups) {
                createTimelineSegment(
                    group.final_audio_start, 
                    group.final_audio_end, 
                    group.orig_start, 
                    group.orig_end, 
                    group.text
                );
                current_time = group.final_audio_end;
            }`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched');
