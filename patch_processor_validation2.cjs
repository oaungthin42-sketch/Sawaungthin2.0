const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /\/\/ Validate final output duration[\s\S]*?if \(diff > 0\.3\) \{[\s\S]*?throw new Error[^\n]*\n\s*\}/m;
const replacement = `// Validate final output duration
            const finalDurs = await getStreamsDuration(finalOutPath);
            const vDur = finalDurs.effectiveVideoDuration;
            const aDur = finalDurs.effectiveAudioDuration;
            const diff = Math.abs(vDur - aDur);
            
            console.log(\`[FINAL-SYNC-DIAGNOSTIC]\`);
            console.log(\`has_video: \${finalDurs.hasVideo}\`);
            console.log(\`has_audio: \${finalDurs.hasAudio}\`);
            console.log(\`video_source: \${finalDurs.videoSource}\`);
            console.log(\`audio_source: \${finalDurs.audioSource}\`);
            console.log(\`video_duration: \${vDur.toFixed(3)}\`);
            console.log(\`audio_duration: \${aDur.toFixed(3)}\`);
            console.log(\`difference: \${diff.toFixed(3)}\`);
            console.log(\`expected_audio_duration: \${state.audioDuration.toFixed(3)}\`);
            
            let expected_video_duration = 0;
            if (state.timeline && state.timeline.length > 0) {
                expected_video_duration = state.timeline[state.timeline.length - 1].end_time;
            }
            console.log(\`expected_video_duration: \${expected_video_duration.toFixed(3)}\`);

            if (!finalDurs.hasVideo) {
                throw new Error(\`Pipeline Error: Final output is missing a video stream.\`);
            }
            if (!finalDurs.hasAudio) {
                throw new Error(\`Pipeline Error: Final output is missing an audio stream.\`);
            }
            if (finalDurs.videoSource === 'unknown' || finalDurs.audioSource === 'unknown') {
                console.warn(\`[FINAL-SYNC-DIAGNOSTIC] WARNING: Unknown stream duration sources. Sync drift check might be inaccurate.\`);
            }

            if (diff > 0.3) {
                console.error(\`[FINAL-SYNC-DIAGNOSTIC] ERROR: Final audio/video sync difference (\${diff.toFixed(3)}s) exceeds 0.3s tolerance!\`);
                throw new Error(\`Pipeline Error: Final A/V sync drift exceeded 0.3s (Video: \${vDur.toFixed(3)}s [\${finalDurs.videoSource}], Audio: \${aDur.toFixed(3)}s [\${finalDurs.audioSource}])\`);
            }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched processor validation');
