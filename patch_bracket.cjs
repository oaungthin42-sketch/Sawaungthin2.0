const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

code = code.replace(
`                        } else {
                            console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                            state.warnings.push("⚠ Subtitles could not be burned in: FFmpeg failed to produce output file");
                        }
                    } catch(e) {`,
`                        } else {
                            console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                            state.warnings.push("⚠ Subtitles could not be burned in: FFmpeg failed to produce output file");
                        }
                    }
                } catch(e) {`
);

fs.writeFileSync('src/workers/processor.js', code, 'utf8');
