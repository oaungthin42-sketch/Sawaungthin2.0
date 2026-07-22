import re

with open('src/workers/processor.js', 'r') as f:
    content = f.read()

# 1. Update the segment generation loop to include ducking
old_loop = r"""                        const speed = t.speed || 1.0;

                        const aSegFile = path.join\(cacheDir, `aseg_\$\{globalIdx\}\.wav`\);
                        const aSegFileTmp = path.join\(cacheDir, `aseg_\$\{globalIdx\}\.wav\.tmp`\);

                        if \(!fs\.existsSync\(aSegFile\)\) \{
                            const aArgs = \[
                                '-ss', s_start,
                                '-t', source_dur,
                                '-i', path\.resolve\(job\.videoPath\),
                                '-vn',
                                '-filter_complex', `\[0:a\]atempo=\$\{speed\.toFixed\(4\)\},apad\[a\]`,
                                '-map', '\[a\]',
                                '-t', target_dur,
                                '-acodec', 'pcm_s16le', '-f', 'wav',
                                '-ar', '44100',
                                '-ac', '2',
                                '-y', aSegFileTmp
                            \];"""

new_loop = """                        const speed = t.speed || 1.0;

                        const aSegFile = path.join(cacheDir, `aseg_${globalIdx}.wav`);
                        const aSegFileTmp = path.join(cacheDir, `aseg_${globalIdx}.wav.tmp`);

                        if (!fs.existsSync(aSegFile)) {
                            // Calculate local ducking expression for this segment
                            const segGlobalStart = t.global_start;
                            const segGlobalEnd = segGlobalStart + t.target_dur;
                            let localEnvelopeExprs = [];
                            for (const interval of mergedIntervals) {
                                if (interval.A < segGlobalEnd && interval.B > segGlobalStart) {
                                    const localA = interval.A - segGlobalStart;
                                    const localB = interval.B - segGlobalStart;
                                    localEnvelopeExprs.push(`clip((t-${localA.toFixed(3)})/0.3,0,1)*clip(({${localB.toFixed(3)}}-t)/0.3,0,1)`);
                                }
                            }
                            
                            let volumeFilters = [];
                            if (localEnvelopeExprs.length > 0) {
                                // Batch expressions just in case there are many in a single segment (unlikely, but safe)
                                let batch = [];
                                for (let j = 0; j < localEnvelopeExprs.length; j++) {
                                    batch.push(localEnvelopeExprs[j]);
                                    if (batch.length >= 20 || j === localEnvelopeExprs.length - 1) {
                                        volumeFilters.push(`volume='1.0-0.85*clip(${batch.join('+')},0,1)':eval=frame`);
                                        batch = [];
                                    }
                                }
                            }
                            
                            let filterChain = `[0:a]atempo=${speed.toFixed(4)},apad`;
                            if (volumeFilters.length > 0) {
                                filterChain += `,${volumeFilters.join(',')}`;
                            }
                            filterChain += `[a]`;

                            const aArgs = [
                                '-ss', s_start,
                                '-t', source_dur,
                                '-i', path.resolve(job.videoPath),
                                '-vn',
                                '-filter_complex', filterChain,
                                '-map', '[a]',
                                '-t', target_dur,
                                '-acodec', 'pcm_s16le', '-f', 'wav',
                                '-ar', '44100',
                                '-ac', '2',
                                '-y', aSegFileTmp
                            ];"""

content = re.sub(old_loop, new_loop, content)

# Remove -shortest
content = re.sub(r"'-shortest',\s*", "", content)

with open('src/workers/processor.js', 'w') as f:
    f.write(content)
print("Patched src/workers/processor.js")
