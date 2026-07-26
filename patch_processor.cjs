const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

// 1. Add puppeteer import
code = code.replace(
"import path from 'path';",
"import path from 'path';\nimport puppeteer from 'puppeteer-core';"
);

// 2. Fix pad = 6 -> pad = 12
code = code.replace(
/const pad = 6;/g,
"const pad = 12;"
);

// 3. Subtitle logic replacement
// Wait, I need to match exactly from `let fontName = "Padauk";` to `fs.renameSync(subTmpPath, finalOutPath);`
// Let's use string boundaries instead of regex to be safe.
const startBoundary = `let fontName = "Padauk";`;
const endBoundary = `                            console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                        }
                    }`;

const startIndex = code.indexOf(startBoundary);
const endIndex = code.indexOf(endBoundary);

if (startIndex === -1 || endIndex === -1) {
    console.error("Boundaries not found!", startIndex, endIndex);
    process.exit(1);
}

const replacement = `let fontName = "Padauk";
                        let fontCss = \`font-family: 'Padauk', 'Noto Sans Myanmar', sans-serif;\`;
                        if (job.selectedFontId) {
                            try {
                                const row = db.prepare('SELECT storedFilename FROM fonts WHERE id = ?').get(job.selectedFontId);
                                if (row) {
                                    const fontPath = path.join(process.cwd(), 'public', 'fonts', row.storedFilename);
                                    if (fs.existsSync(fontPath)) {
                                        fontCss = \`
                                        @font-face {
                                            font-family: 'CustomFont';
                                            src: url('file://\${fontPath}');
                                        }
                                        body { font-family: 'CustomFont', 'Padauk', sans-serif !important; }
                                        \`;
                                    }
                                }
                            } catch (err) {
                                console.error("Error fetching custom font", err);
                            }
                        }

                        // Generate PNGs using Puppeteer
                        let browserPath = '/usr/bin/chromium';
                        if (!fs.existsSync(browserPath)) {
                            browserPath = '/app/applet/puppeteer-cache/chrome/linux-150.0.7871.24/chrome-linux64/chrome';
                        }
                        
                        let browser;
                        let usePuppeteer = false;
                        try {
                            browser = await puppeteer.launch({
                                executablePath: browserPath,
                                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                            });
                            usePuppeteer = true;
                        } catch(e) {
                            console.error("[SUBTITLE] Failed to launch Puppeteer:", e);
                        }

                        if (usePuppeteer) {
                            console.log("[SUBTITLE] Burning " + subtitles.length + " subtitles using Puppeteer PNG overlays...");
                            const page = await browser.newPage();
                            await page.setViewport({ width: 1080, height: 1920 });
                            
                            const pngInputs = [];
                            let filterComplexStr = "";
                            let overlayLastOut = "0:v";
                            
                            for (let i = 0; i < subtitles.length; i++) {
                                const sub = subtitles[i];
                                const pngPath = path.join(tmpDir, \`\${jobId}_sub_\${i}.png\`);
                                
                                const html = \`
                                <html>
                                <head>
                                <style>
                                \${fontCss}
                                </style>
                                </head>
                                <body style="margin:0; padding:0; background:transparent;">
                                    <div style="
                                        font-size:\${fontsize}px; 
                                        color:white; 
                                        text-align:center; 
                                        -webkit-text-stroke: \${Math.max(2, Math.floor(fontsize/20))}px black; 
                                        white-space:pre-wrap; 
                                        width:\${pos.widthPct}vw; 
                                        position:absolute; 
                                        left:\${pos.xPct}vw; 
                                        top:\${pos.yPct}vh; 
                                        text-shadow: 0px 4px 10px rgba(0,0,0,0.8);
                                        line-height:1.2;
                                        transform: translateY(-50%);
                                    ">\${sub.text}</div>
                                </body>
                                </html>
                                \`;
                                await page.setContent(html);
                                await page.screenshot({ path: pngPath, omitBackground: true });
                                
                                pngInputs.push('-loop', '1', '-i', pngPath);
                                
                                const currentOut = \`v\${i}\`;
                                // overlay inputs: video is overlayLastOut, image is i+1 (since 0 is video)
                                filterComplexStr += \`[\${overlayLastOut}][\${i+1}:v]overlay=x=0:y=0:enable='between(t,\${sub.start},\${sub.end})'[\${currentOut}]; \`;
                                overlayLastOut = currentOut;
                            }
                            await browser.close();
                            
                            const subTmpPath = path.join(tmpDir, jobId + "_subburn.mp4");
                            const subArgs = [
                                '-i', finalOutPath,
                                ...pngInputs,
                                '-filter_complex', filterComplexStr,
                                '-map', \`[\${overlayLastOut}]\`,
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
                        } else {
                            console.log("[SUBTITLE] Falling back to libass...");
                            // Fallback to old ASS implementation
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
                            
                            const filterComplex = \`[0:v]subtitles='\${assPath.replace(/:/g, '\\\\:')}':charenc=UTF-8[v]\`;
                            
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
                            }
                        }
                    }`;

const newCode = code.substring(0, startIndex) + replacement + code.substring(endIndex + endBoundary.length);
fs.writeFileSync('src/workers/processor.js', newCode, 'utf8');
