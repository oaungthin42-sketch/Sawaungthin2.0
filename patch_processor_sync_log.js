import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const target = `            const finalDurs = await getStreamsDuration(finalOutPath);
            const vDur = finalDurs.videoDuration;
            const aDur = finalDurs.audioDuration;
            const diff = Math.abs(vDur - aDur);
            console.log(\`[Job \${jobId}] Final Video Duration: \${vDur.toFixed(3)}s, Audio Duration: \${aDur.toFixed(3)}s, Diff: \${diff.toFixed(3)}s\`);
            
            if (diff > 0.3) {
                console.warn(\`[Job \${jobId}] Warning: Final audio/video sync difference (\${diff.toFixed(3)}s) exceeds 0.3s tolerance!\`);`;

const replacement = `            const finalDurs = await getStreamsDuration(finalOutPath);
            const vDur = finalDurs.videoDuration;
            const aDur = finalDurs.audioDuration;
            const diff = Math.abs(vDur - aDur);
            console.log(\`[SYNC] TTS Duration: \${state.audioDuration.toFixed(3)} seconds\`);
            console.log(\`[SYNC] Timeline Duration: \${state.timeline.length > 0 ? state.timeline[state.timeline.length - 1].end_time.toFixed(3) : 0} seconds\`);
            console.log(\`[SYNC] Final Video Duration: \${vDur.toFixed(3)} seconds\`);
            console.log(\`[SYNC] Drift: \${diff.toFixed(3)} seconds\`);
            
            if (diff > 0.3) {
                console.warn(\`[Job \${jobId}] Warning: Final audio/video sync difference (\${diff.toFixed(3)}s) exceeds 0.3s tolerance!\`);`;

if (content.includes("const finalDurs = await getStreamsDuration(finalOutPath);")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Patched Processor sync logging successfully.");
} else {
    console.log("Target not found.");
}
