const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

const blurTarget = `                    console.log("[BLUR] Parsed boxes:", JSON.stringify(parsedBoxes));
                    console.log("[BLUR] filterComplex:", filterComplex);
                    
                    if (!filterComplex || filterComplex.trim() === '') {
                        console.error('[BLUR] filterComplex was empty, skipping blur step.');
                        return; // Wait, actually I shouldn't return, just skip calling ffmpeg
                    }
                    
                    // trim trailing semicolon
                    filterComplex = filterComplex.replace(/;\\s*$/, '');
                    
                    const blurArgs = [
                        '-i', finalOutPath,
                        '-filter_complex', filterComplex,
                        '-map', lastMap, '-map', '0:a?',
                        '-c:a', 'copy',
                        '-c:v', 'libx264',
                        '-preset', 'fast',
                        '-y', blurTmpPath
                    ];
                    
                    await runFFmpeg(blurArgs, tmpDir);
                    
                    if (fs.existsSync(blurTmpPath) && fs.statSync(blurTmpPath).size > 0) {
                        fs.unlinkSync(finalOutPath);
                        fs.renameSync(blurTmpPath, finalOutPath);
                    } else {
                        console.error("[BLUR] Error: blur adjustment failed to produce output file, skipping.");
                        state.warnings.push("⚠ Blur could not be applied: FFmpeg failed to produce output file");
                    }`;

const blurReplacement = `                    console.log("[BLUR] Parsed boxes:", JSON.stringify(parsedBoxes));
                    console.log("[BLUR] filterComplex:", filterComplex);
                    
                    if (!filterComplex || filterComplex.trim() === '') {
                        console.error('[BLUR] filterComplex was empty, skipping blur step.');
                    } else {
                        // trim trailing semicolon
                        filterComplex = filterComplex.replace(/;\\s*$/, '');
                        
                        const blurArgs = [
                            '-i', finalOutPath,
                            '-filter_complex', filterComplex,
                            '-map', lastMap, '-map', '0:a?',
                            '-c:a', 'copy',
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            '-y', blurTmpPath
                        ];
                        
                        await runFFmpeg(blurArgs, tmpDir);
                        
                        if (fs.existsSync(blurTmpPath) && fs.statSync(blurTmpPath).size > 0) {
                            fs.unlinkSync(finalOutPath);
                            fs.renameSync(blurTmpPath, finalOutPath);
                        } else {
                            console.error("[BLUR] Error: blur adjustment failed to produce output file, skipping.");
                            state.warnings.push("⚠ Blur could not be applied: FFmpeg failed to produce output file");
                        }
                    }`;

if (code.includes(blurTarget)) {
    code = code.replace(blurTarget, blurReplacement);
    console.log("blur patch success");
} else {
    console.error("blurTarget not found");
}

fs.writeFileSync('src/workers/processor.js', code, 'utf8');
