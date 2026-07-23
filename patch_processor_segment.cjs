const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /for \(let i = 0; i < state\.timeline\.length; i\+\+\) \{[\s\S]*?\} catch\(e\) \{\}\n\s*\}/m;
const replacement = `const limit = process.env.SEGMENT_CONCURRENCY ? parseInt(process.env.SEGMENT_CONCURRENCY, 10) : 3;
            for (let i = 0; i < state.timeline.length; i += limit) {
                const batch = state.timeline.slice(i, i + limit);
                await Promise.all(batch.map(async (t, batchIdx) => {
                    const globalIdx = i + batchIdx;
                    updateJob(jobId, { progress: 80 + (10 * (globalIdx / state.timeline.length)) });
                    
                    if (!Number.isFinite(t.scene_start) || !Number.isFinite(t.scene_end)) {
                        throw new Error(\`Pipeline Error: Segment \${globalIdx} has non-finite scene bounds (\${t.scene_start} - \${t.scene_end})\`);
                    }
                    if (t.scene_start < 0) {
                        throw new Error(\`Pipeline Error: Segment \${globalIdx} has negative scene_start (\${t.scene_start})\`);
                    }
                    if (t.scene_end <= t.scene_start) {
                        throw new Error(\`Pipeline Error: Segment \${globalIdx} has scene_end (\${t.scene_end}) <= scene_start (\${t.scene_start})\`);
                    }
                    
                    let sEnd = t.scene_end;
                    if (state.originalVideoDuration) {
                        if (sEnd > state.originalVideoDuration) {
                            const diff = sEnd - state.originalVideoDuration;
                            if (diff > 0.5) {
                                throw new Error(\`Pipeline Error: Segment \${globalIdx} scene_end (\${sEnd}) severely exceeds original video duration (\${state.originalVideoDuration})\`);
                            }
                            sEnd = state.originalVideoDuration;
                            t.scene_end = sEnd;
                        }
                        if (sEnd <= t.scene_start) {
                            throw new Error(\`Pipeline Error: Segment \${globalIdx} has scene_end (\${sEnd}) <= scene_start (\${t.scene_start}) after clamping\`);
                        }
                    }
                    
                    const s_start = t.scene_start.toFixed(3);
                    const source_dur = (t.scene_end - t.scene_start).toFixed(3);
                    const s_end = t.scene_end.toFixed(3);
                    const speed = t.speed || 1.0;
                    const target_dur = t.target_dur.toFixed(3);
                    
                    const filter = \`[0:v]setpts=\${(1/speed).toFixed(4)}*(PTS-STARTPTS),tpad=stop_mode=clone:stop_duration=\${target_dur},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p[v]\`;
                    
                    const segFile = path.join(cacheDir, \`seg_\${globalIdx}.ts\`);
                    const segFileTmp = path.join(cacheDir, \`seg_\${globalIdx}.ts.tmp\`);
                    
                    if (!fs.existsSync(segFile)) {
                        const args = [
                            '-ss', s_start,
                            '-t', source_dur,
                            '-i', path.resolve(job.videoPath),
                            '-filter_complex', filter,
                            '-map', '[v]',
                            '-t', target_dur,
                            '-c:v', 'libx264',
                            '-preset', 'ultrafast',
                            '-threads', '2',
                            '-crf', '28',
                            '-f', 'mpegts',
                            '-y', segFileTmp
                        ];
                        try {
                            await runFFmpeg(args, tmpDir);
                        } catch (err) {
                            if (fs.existsSync(segFileTmp)) fs.unlinkSync(segFileTmp);
                            throw err;
                        }
                        
                        if (fs.existsSync(segFileTmp) && fs.statSync(segFileTmp).size > 0) {
                            fs.renameSync(segFileTmp, segFile);
                        } else {
                            if (fs.existsSync(segFileTmp)) fs.unlinkSync(segFileTmp);
                            throw new Error(\`Pipeline Error: Segment \${globalIdx} generation failed or produced 0 bytes.\`);
                        }
                    }
                    
                    try {
                        const actualDur = await getDuration(segFile);
                        const fileSize = fs.statSync(segFile).size;
                        console.log(\`[SEGMENT-DIAGNOSTIC] index: \${globalIdx} | scene: \${s_start}->\${s_end} | source_dur: \${source_dur} | speed: \${speed.toFixed(4)} | target_dur: \${target_dur} | actual_file_dur: \${actualDur} | file_size: \${fileSize}\`);
                    } catch(e) {}
                }));
            }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched Segment Builder concurrency');
