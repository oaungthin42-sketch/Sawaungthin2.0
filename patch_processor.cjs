const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

// Blur error handling
code = code.replace(
`                    } else {
                        console.error("[BLUR] Error: blur adjustment failed to produce output file, skipping.");
                    }
                }
            } catch(e) {
                console.error("[BLUR] Error applying blur boxes:", e);
            }`,
`                    } else {
                        console.error("[BLUR] Error: blur adjustment failed to produce output file, skipping.");
                        state.warnings.push("⚠ Blur could not be applied: FFmpeg failed to produce output file");
                    }
                }
            } catch(e) {
                console.error("[BLUR] Error applying blur boxes:", e);
                state.warnings.push("⚠ Blur could not be applied: " + e.message);
            }`
);

// Subtitle Puppeteer launch error
code = code.replace(
`                        try {
                            browser = await puppeteer.launch({
                                executablePath: browserPath,
                                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                            });
                            usePuppeteer = true;
                        } catch(e) {
                            console.error("[SUBTITLE] Failed to launch Puppeteer:", e);
                        }`,
`                        try {
                            browser = await puppeteer.launch({
                                executablePath: browserPath,
                                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                            });
                            usePuppeteer = true;
                        } catch(e) {
                            console.error("[SUBTITLE] Failed to launch Puppeteer:", e.message, e.stack);
                            state.warnings.push("⚠ Subtitles could not be burned in (Puppeteer launch failed): " + e.message);
                        }`
);

// Subtitle Puppeteer output check error
code = code.replace(
`                            if (fs.existsSync(subTmpPath) && fs.statSync(subTmpPath).size > 0) {
                                fs.unlinkSync(finalOutPath);
                                fs.renameSync(subTmpPath, finalOutPath);
                            } else {
                                console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                            }`,
`                            if (fs.existsSync(subTmpPath) && fs.statSync(subTmpPath).size > 0) {
                                fs.unlinkSync(finalOutPath);
                                fs.renameSync(subTmpPath, finalOutPath);
                            } else {
                                console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                                state.warnings.push("⚠ Subtitles could not be burned in: FFmpeg failed to produce output file");
                            }`
);

// Subtitle libass fallback error
code = code.replace(
`                            if (fs.existsSync(subTmpPath) && fs.statSync(subTmpPath).size > 0) {
                                fs.unlinkSync(finalOutPath);
                                fs.renameSync(subTmpPath, finalOutPath);
                            } else {
                                console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                            }
                        }
                    }`,
`                            if (fs.existsSync(subTmpPath) && fs.statSync(subTmpPath).size > 0) {
                                fs.unlinkSync(finalOutPath);
                                fs.renameSync(subTmpPath, finalOutPath);
                            } else {
                                console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                                state.warnings.push("⚠ Subtitles could not be burned in: FFmpeg failed to produce output file (libass fallback)");
                            }
                        }
                    } catch(e) {
                        console.error("[SUBTITLE] Error:", e);
                        state.warnings.push("⚠ Subtitles could not be burned in: " + e.message);
                    }
                    }`
);

// wait, the outer try/catch for subtitles?
// Let's check if there is an outer try/catch for subtitles.
