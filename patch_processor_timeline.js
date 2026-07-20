import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const searchPointStart = `        // 6. SEMANTIC MATCHING & 7. TIMELINE BUILDER
        if (!hasCompletedStep(job.currentStep, STEPS.TIMELINE_BUILDER)) {
            advanceStep(STEPS.SEMANTIC_MATCHING, 55, 'Semantic & Chronological Matching');`;

const searchPointEnd = `                        throw new Error(\`Pipeline Error: Invalid timeline entry (narration index: \${nIdx}, scene index: \${sIdx}, start: \${start}, end: \${end}, target duration: \${target_dur})\`);
                    }
                }
                
                for (let i = 0; i < N_narrations; i++) {
                    const start = state.narrationTranscript[i].timestamp[0];
                    const end = state.narrationTranscript[i].timestamp[1];
                    const sIdx = assigned_scenes[i];
                    
                    let prev_sIdx = timeline.length > 0 ? timeline[timeline.length-1].matched_scene_index : -1;
                    if (prev_sIdx !== -1 && sIdx > prev_sIdx + 1) {
                        const filler_dur = 0.5;
                        createTimelineSegment(start - filler_dur, start, prev_sIdx + 1, "[Filler Scene]", true, -1);
                    }
                    createTimelineSegment(start, end, sIdx, state.narrationTranscript[i].text, false, i);
                }
            } else {
                timeline.push({
                    segment_index: 0,
                    start_time: 0,
                    end_time: state.audioDuration,
                    target_dur: state.audioDuration,
                    scene_start: 0,
                    scene_end: state.originalVideoDuration,
                    speed: state.originalVideoDuration / state.audioDuration,
                    narration_text: "[No Narration]"
                });
            }
            
            state.timeline = timeline;
            saveState();
            
            advanceStep(STEPS.TIMELINE_BUILDER, 75, 'Timeline Generated');
        }`;

