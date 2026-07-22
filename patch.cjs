const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

// 1. Calculate global_start for each segment
code = code.replace(
    'let authTimeline = [];',
    `let currentGlobalTime = 0;
            for (let i = 0; i < state.timeline.length; i++) {
                state.timeline[i].global_start = currentGlobalTime;
                currentGlobalTime += state.timeline[i].target_dur;
            }
            
            let authTimeline = [];`
);

// 2. Remove duckingFilterChain generation block
const blockToRemoveRegex = /if \(mergedIntervals\.length > 0\) {[\s\S]*?let duckingFilterChain = duckingFilters\.join\(','\);/;
code = code.replace(blockToRemoveRegex, `// ducking filters are now applied per-segment`);

// 3. Update the aArgs loop
const loopRegex = /const globalIdx = i \+ batchIdx;[\s\S]*?const aArgs = \[[^\]]+\];/;

const newLoopContent = `const globalIdx = i + batchIdx;
                        const s_start = t.scene_start.toFixed(3);
                        const source_dur = (t.scene_end - t.scene_start).toFixed(3);
                        const target_dur = t.target_dur; // as number
                        const speed = t.speed || 1.0;
                        
                        const segGlobalStart = t.global_start;
                        const segGlobalEnd = segGlobalStart + target_dur;

                        let localEnvelopeExprs = [];
                        for (const interval of mergedIntervals) {
                            if (interval.A < segGlobalEnd && interval.B > segGlobalStart) {
                                const localA = interval.A - segGlobalStart;
                                const localB = interval.B - segGlobalStart;
                                localEnvelopeExprs.push(\`clip((t-\${localA.toFixed(3)})/0.3,0,1)*clip((\${localB.toFixed(3)}-t)/0.3,0,1)\`);
                            }
                        }

                        let volumeFilters = [];
                        if (localEnvelopeExprs.length > 0) {
                            let batch = [];
                            for (let j = 0; j < localEnvelopeExprs.length; j++) {
                                batch.push(localEnvelopeExprs[j]);
                                if (batch.length >= 20 || j === localEnvelopeExprs.length - 1) {
                                    volumeFilters.push(\`volume='1.0-0.85*clip(\${batch.join('+')},0,1)':eval=frame\`);
                                    batch = [];
                                }
                            }
                        } else {
                            volumeFilters.push(\`volume=1.0\`);
                        }

                        let filterChain = \`[0:a]atempo=\${speed.toFixed(4)},apad\`;
                        if (volumeFilters.length > 0) {
                            filterChain += \`,\${volumeFilters.join(',')}\`;
                        }
                        filterChain += \`[a]\`;

                        const aSegFile = path.join(cacheDir, \`aseg_\${globalIdx}.wav\`);
                        const aSegFileTmp = path.join(cacheDir, \`aseg_\${globalIdx}.wav.tmp\`);
                        
                        if (!fs.existsSync(aSegFile)) {
                            const aArgs = [
                                '-ss', s_start,
                                '-t', source_dur,
                                '-i', path.resolve(job.videoPath),
                                '-vn',
                                '-filter_complex', filterChain,
                                '-map', '[a]',
                                '-t', target_dur.toFixed(3),
                                '-acodec', 'pcm_s16le', '-f', 'wav',
                                '-ar', '44100',
                                '-ac', '2',
                                '-y', aSegFileTmp
                            ];`;
                            
code = code.replace(loopRegex, newLoopContent);

// 4. Update the final mix
code = code.replace(
    /'-filter_complex',\s*`\[0:a\]\$\{duckingFilterChain\}\[bg\];\[bg\]\[1:a\]amix=inputs=2:duration=longest\[aout\]`,/,
    `'-filter_complex', \`[0:a][1:a]amix=inputs=2:duration=longest[aout]\`,`
);

fs.writeFileSync('src/workers/processor.js', code);
console.log("Patched successfully");
