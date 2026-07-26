const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

// I will match from `let fontName = "Padauk";` down to `                    state.warnings.push("⚠ Subtitles could not be burned in: " + e.message);\n                }`

const subTargetStart = `                        let fontName = "Padauk";`;
const subTargetEnd = `                    state.warnings.push("⚠ Subtitles could not be burned in: " + e.message);\n                }`;

const startIndex = code.indexOf(subTargetStart);
const endIndex = code.indexOf(subTargetEnd) + subTargetEnd.length;

if (startIndex === -1 || code.indexOf(subTargetEnd) === -1) {
    console.error("subTarget not found!");
    process.exit(1);
}

const newSubCode = `                        let fontName = "Padauk";
                        if (job.selectedFontId) {
                            try {
                                const row = db.prepare('SELECT storedFilename FROM fonts WHERE id = ?').get(job.selectedFontId);
                                if (row) {
                                    const fontPath = path.join(process.cwd(), 'public', 'fonts', row.storedFilename);
                                    if (fs.existsSync(fontPath)) {
                                        try {
                                            const { execSync } = require('child_process');
                                            const familyRaw = execSync('fc-scan --format "%{family}\\n" "' + fontPath + '"').toString().trim();
                                            if (familyRaw) {
                                                fontName = familyRaw.split(',')[0].trim();
                                            }
                                        } catch(e) {
                                            console.error("Font scan error", e);
                                        }
                                    }
                                }
                            } catch (err) {
                                console.error("Error fetching custom font", err);
                            }
                        }

                        console.log("[SUBTITLE] Burning " + subtitles.length + " subtitles using libass...");
                        
                        const toAssTime = (sec) => {
                            const h = Math.floor(sec / 3600);
                            const m = Math.floor((sec % 3600) / 60);
                            const s = Math.floor(sec % 60);
                            const cs = Math.floor((sec % 1) * 100);
                            return \`\${h}:\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}.\${cs.toString().padStart(2, '0')}\`;
                        };
                        
                        const assHeader = \`[Script Info]\\nScriptType: v4.00+\\nPlayResX: 1080\\nPlayResY: 1920\\nWrapStyle: 1\\n\\n[V4+ Styles]\\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\\nStyle: Default,\${fontName},\${fontsize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,8,0,8,\${marginL},\${marginR},\${marginV},1\\n\\n[Events]\\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\\n\`;
                        
                        const assLines = subtitles.map(sub => {
                            const startStr = toAssTime(sub.start);
                            const endStr = toAssTime(sub.end);
                            const assText = sub.text.replace(/\\n/g, '\\\\N');
                            return \`Dialogue: 0,\${startStr},\${endStr},Default,,0,0,0,,\${assText}\`;
                        });
                        
                        const assPath = path.join(tmpDir, jobId + ".ass");
                        fs.writeFileSync(assPath, '\\uFEFF' + assHeader + assLines.join('\\n') + '\\n', 'utf8');
                        
                        const filterComplex = job.selectedFontId
                            ? \`[0:v]subtitles='\${assPath.replace(/:/g, '\\\\:')}':fontsdir='\${path.join(process.cwd(), 'public', 'fonts').replace(/:/g, '\\\\:')}':charenc=UTF-8[v]\`
                            : \`[0:v]subtitles='\${assPath.replace(/:/g, '\\\\:')}':charenc=UTF-8[v]\`;
                        
                        const subTmpPath = path.join(tmpDir, jobId + "_subburn.mp4");
                        const subArgs = [
                            '-i', finalOutPath,
                            '-filter_complex', filterComplex,
                            '-map', '[v]',
                            '-map', '0:a?',
                            '-c:a', 'copy',
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            '-y', subTmpPath
                        ];
                        
                        await runFFmpeg(subArgs, tmpDir);
                        
                        if (fs.existsSync(subTmpPath) && fs.statSync(subTmpPath).size > 0) {
                            fs.unlinkSync(finalOutPath);
                            fs.renameSync(subTmpPath, finalOutPath);
                        } else {
                            console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                            state.warnings.push("⚠ Subtitles could not be burned in: FFmpeg failed to produce output file");
                        }
                    } catch(e) {
                        console.error("[SUBTITLE] Error burning subtitles:", e);
                        state.warnings.push("⚠ Subtitles could not be burned in: " + e.message);
                    }`;

code = code.substring(0, startIndex) + newSubCode + code.substring(endIndex);
fs.writeFileSync('src/workers/processor.js', code, 'utf8');
console.log("Sub patch success!");
