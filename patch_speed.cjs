const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

// Update STEPS
content = content.replace("EXPORT: 'Export Final',", "EXPORT: 'Export Final',\n    SPEED_ADJUST: 'Speed Adjust',");

// Add logic
const targetString = `        updateJob(jobId, {
            status: 'complete',
            progress: 100,`;

const logicString = `        // 12. SPEED ADJUST
        if (!hasCompletedStep(job.currentStep, STEPS.SPEED_ADJUST)) {
            advanceStep(STEPS.SPEED_ADJUST, 99, 'Adjusting Final Speed');
            
            let multiplier = parseFloat(getSetting('OUTPUT_SPEED_MULTIPLIER')) || 1.0;
            if (multiplier < 0.5) multiplier = 0.5;
            if (multiplier > 3.0) multiplier = 3.0;

            if (multiplier !== 1.0) {
                console.log(\`[SPEED-ADJUST] Applying output multiplier: \${multiplier}x\`);
                const speedTmpPath = path.join(tmpDir, \`\${jobId}_speed.mp4\`);
                const speedArgs = [
                    '-i', finalOutPath,
                    '-filter_complex', \`[0:v]setpts=PTS/\${multiplier}[v];[0:a]atempo=\${multiplier}[a]\`,
                    '-map', '[v]',
                    '-map', '[a]',
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-y', speedTmpPath
                ];
                await runFFmpeg(speedArgs, tmpDir);
                
                if (fs.existsSync(speedTmpPath) && fs.statSync(speedTmpPath).size > 0) {
                    fs.unlinkSync(finalOutPath);
                    fs.renameSync(speedTmpPath, finalOutPath);
                } else {
                    throw new Error("Pipeline Error: Speed adjustment failed to produce output file.");
                }
            }
        }
        
        updateJob(jobId, {
            status: 'complete',
            progress: 100,`;

content = content.replace(targetString, logicString);
fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched processor.js');
