const fs = require('fs');

// 1. ffmpeg/index.js
let ffmpeg = fs.readFileSync('src/ffmpeg/index.js', 'utf8');
ffmpeg = ffmpeg.replace(/console\.log\(`\[FFmpeg\] Running command: ffmpeg \$\{args\.join\(' '\)\}`\);/g, "console.log(`[FFmpeg] Running (cwd=${cwd}): ${args[0]} ... (${args.length} args)`);");
fs.writeFileSync('src/ffmpeg/index.js', ffmpeg, 'utf8');

// 2. workers/processor.js
let processor = fs.readFileSync('src/workers/processor.js', 'utf8');
processor = processor.replace(/let limit = 5;/, 'let limit = 2;');

const audioTryBlock = `                            try {
                                await runFFmpeg(aArgs, tmpDir, null, 120000); // 2 min timeout
                                if (fs.existsSync(aSegFileTmp) && fs.statSync(aSegFileTmp).size > 0) {
                                    fs.renameSync(aSegFileTmp, aSegFile);
                                } else {
                                    throw new Error("0 bytes");
                                }
                            } catch (err) {
                                audioExtractionFailures++;
                                failedAudioSegments.push(globalIdx);
                                console.warn(\`[AUDIO-MIX] Failed to extract audio for segment \${globalIdx}, substituting silence... Error: \${err.message}\`);
                                if (fs.existsSync(aSegFileTmp)) fs.unlinkSync(aSegFileTmp);
                                const silArgs = [
                                    '-f', 'lavfi',
                                    '-i', 'anullsrc=r=44100:cl=stereo',
                                    '-t', target_dur,
                                    '-acodec', 'pcm_s16le', '-f', 'wav',
                                    '-y', aSegFileTmp
                                ];
                                await runFFmpeg(silArgs, tmpDir);
                                fs.renameSync(aSegFileTmp, aSegFile);
                            }`;

const audioTryBlockNew = `                            let attempt = 0;
                            let success = false;
                            while (attempt < 3 && !success) {
                                attempt++;
                                try {
                                    await runFFmpeg(aArgs, tmpDir, null, 120000); // 2 min timeout
                                    if (fs.existsSync(aSegFileTmp) && fs.statSync(aSegFileTmp).size > 0) {
                                        fs.renameSync(aSegFileTmp, aSegFile);
                                        success = true;
                                    } else {
                                        throw new Error("0 bytes");
                                    }
                                } catch (err) {
                                    console.warn(\`[AUDIO-MIX] Attempt \${attempt}/3 failed for segment \${globalIdx}: \${err.message}\`);
                                    if (fs.existsSync(aSegFileTmp)) fs.unlinkSync(aSegFileTmp);
                                    if (attempt < 3) {
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                    }
                                }
                            }
                            
                            if (!success) {
                                audioExtractionFailures++;
                                failedAudioSegments.push(globalIdx);
                                console.warn(\`[AUDIO-MIX] All 3 attempts failed for segment \${globalIdx}, substituting silence.\`);
                                const silArgs = [
                                    '-f', 'lavfi',
                                    '-i', 'anullsrc=r=44100:cl=stereo',
                                    '-t', target_dur,
                                    '-acodec', 'pcm_s16le', '-f', 'wav',
                                    '-y', aSegFileTmp
                                ];
                                await runFFmpeg(silArgs, tmpDir);
                                fs.renameSync(aSegFileTmp, aSegFile);
                            }`;

processor = processor.replace(audioTryBlock, audioTryBlockNew);
fs.writeFileSync('src/workers/processor.js', processor, 'utf8');
console.log('patched successfully');
