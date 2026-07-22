import re

with open('src/ai/index.js', 'r') as f:
    content = f.read()

old_code = """
            if (orig_dur > 0 && chunkDur > orig_dur + 0.1) {
                let speed = chunkDur / orig_dur;
                if (speed > 1.8) speed = 1.8;
                const adjustedPath = path.join(ttsDir, `chunk_adj_${String(i).padStart(4, '0')}.wav`);
                await runFFmpeg(['-i', rawChunk, '-filter:a', `atempo=${speed}`, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', adjustedPath], ttsDir);
                processedChunks.push(adjustedPath);
                actualFinalDur = chunkDur / speed;
            } else {
                processedChunks.push(rawChunk);
            }
"""

new_code = """
            if (orig_dur > 0 && chunkDur > orig_dur + 0.1) {
                let speed = chunkDur / orig_dur;
                if (speed > 1.8) speed = 1.8;
                const adjustedPath = path.join(ttsDir, `chunk_adj_${String(i).padStart(4, '0')}.wav`);
                await runFFmpeg(['-i', rawChunk, '-filter:a', `atempo=${speed}`, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', adjustedPath], ttsDir);
                processedChunks.push(adjustedPath);
                actualFinalDur = chunkDur / speed;
            } else {
                const standardizedPath = path.join(ttsDir, `chunk_std_${String(i).padStart(4, '0')}.wav`);
                await runFFmpeg(['-i', rawChunk, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', standardizedPath], ttsDir);
                processedChunks.push(standardizedPath);
                actualFinalDur = chunkDur;
            }
"""

if "processedChunks.push(rawChunk);" in content:
    content = content.replace(old_code.strip(), new_code.strip())
    with open('src/ai/index.js', 'w') as f:
        f.write(content)
    print("Replaced!")
else:
    print("Not found")
