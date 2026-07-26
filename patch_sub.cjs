const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

// We want to replace everything inside the SUBTITLE_BURN if block, starting from reading the srt content.
// The easiest way is to use substring replacement using regex.

const regex = /\/\/ 11\.7 SUBTITLE BURN[\s\S]*?(?=\/\/ 12\. SPEED ADJUST)/;
const match = content.match(regex);
if (!match) {
    console.error("Could not find SUBTITLE_BURN block");
    process.exit(1);
}

const newSubBlock = `// 11.7 SUBTITLE BURN
        if (!hasCompletedStep(job.currentStep, STEPS.SUBTITLE_BURN)) {
            if (state.srtFile && fs.existsSync(state.srtFile)) {
                try {
                    const srtContent = fs.readFileSync(state.srtFile, 'utf8');
                    const blocks = srtContent.trim().split(/\\n\\s*\\n/);
                    let subtitles = [];
                    for (const block of blocks) {
                        const lines = block.split('\\n');
                        if (lines.length >= 3) {
                            const timeLine = lines[1];
                            const textLines = lines.slice(2).join('\\n').trim();
                            const timeParts = timeLine.split(' --> ');
                            if (timeParts.length === 2) {
                                const parseTime = (t) => {
                                    const [hms, ms] = t.split(',');
                                    const [h, m, s] = hms.split(':');
                                    return parseInt(h)*3600 + parseInt(m)*60 + parseInt(s) + parseInt(ms)/1000;
                                };
                                const start = parseTime(timeParts[0]);
                                const end = parseTime(timeParts[1]);
                                if (textLines) {
                                    subtitles.push({ start, end, text: textLines });
                                }
                            }
                        }
                    }

                    if (subtitles.length > 0) {
                        console.log("[SUBTITLE] Burning " + subtitles.length + " subtitles using libass...");
                        const subTmpPath = path.join(tmpDir, jobId + "_subburn.mp4");
                        
                        let pos = { xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 };
                        if (job.subtitlePosition && job.subtitlePosition !== 'null') {
                            try {
                                pos = typeof job.subtitlePosition === 'string' ? JSON.parse(job.subtitlePosition) : job.subtitlePosition;
                            } catch(e) {}
                        }
                        
                        const marginL = Math.round((pos.xPct / 100) * 1080);
                        const marginR = Math.round(1080 - ((pos.xPct + pos.widthPct) / 100) * 1080);
                        const marginV = Math.round((pos.yPct / 100) * 1920);
                        
                        let fontsize = Math.round(((pos.heightPct / 100) * 1920) * 0.6);
                        if (fontsize < 24) fontsize = 24;
                        if (fontsize > 80) fontsize = 80;

                        let fontName = "Noto Sans Myanmar";
                        let fontsDirOpt = "";
                        if (job.selectedFontId) {
                            try {
                                const { execSync } = require('child_process');
                                const row = db.prepare('SELECT storedFilename FROM fonts WHERE id = ?').get(job.selectedFontId);
                                if (row) {
                                    const fontPath = path.join(process.cwd(), 'public', 'fonts', row.storedFilename);
                                    if (fs.existsSync(fontPath)) {
                                        fontsDirOpt = ":fontsdir='" + path.dirname(fontPath).replace(/:/g, '\\\\:') + "'";
                                        try {
                                            const familyRaw = execSync('fc-scan --format "%{family}\\\\n" "' + fontPath + '"').toString().trim();
                                            if (familyRaw) {
                                                fontName = familyRaw.split(',')[0].trim();
                                            }
                                        } catch(e) {
                                            console.error("fc-scan error", e);
                                        }
                                    }
                                }
                            } catch (err) {
                                console.error("Error fetching custom font", err);
                            }
                        }

                        const toAssTime = (sec) => {
                            const h = Math.floor(sec / 3600);
                            const m = Math.floor((sec % 3600) / 60);
                            const s = Math.floor(sec % 60);
                            const cs = Math.floor((sec % 1) * 100);
                            return \`\${h}:\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}.\${cs.toString().padStart(2, '0')}\`;
                        };

                        const assHeader = \`[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,\${fontName},\${fontsize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,8,0,8,\${marginL},\${marginR},\${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
\`;

                        const assLines = subtitles.map(sub => {
                            const startStr = toAssTime(sub.start);
                            const endStr = toAssTime(sub.end);
                            // Replace newlines with ASS newline \N
                            const assText = sub.text.replace(/\\n/g, '\\\\N');
                            return \`Dialogue: 0,\${startStr},\${endStr},Default,,0,0,0,,\${assText}\`;
                        });

                        const assPath = path.join(tmpDir, jobId + ".ass");
                        fs.writeFileSync(assPath, assHeader + assLines.join('\\n') + '\\n', 'utf8');

                        const filterComplex = \`[0:v]subtitles='\${assPath.replace(/:/g, '\\\\:')}'\${fontsDirOpt}[v]\`;

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
                        }
                    }
                } catch(e) {
                    console.error("[SUBTITLE] Error burning subtitles:", e);
                }
            }
            advanceStep(STEPS.SUBTITLE_BURN, 99, 'Subtitles Burned');
        }
        `;

content = content.replace(regex, newSubBlock);
fs.writeFileSync('src/workers/processor.js', content, 'utf8');
