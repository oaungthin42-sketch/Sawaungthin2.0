import fs from 'fs';
const path = './src/workers/processor.js';
let content = fs.readFileSync(path, 'utf8');

const target = `                if (chunk_orig_end <= chunk_orig_start) {
                    let recovered_end = -1;
                    for (let j = i + 1; j < authTimeline.length; j++) {
                        if (Number.isFinite(authTimeline[j].orig_start) && authTimeline[j].orig_start > chunk_orig_start) {
                            recovered_end = authTimeline[j].orig_start;
                            break;
                        }
                    }
                    if (recovered_end !== -1) {
                        chunk_orig_end = recovered_end;
                        console.log(\`[AI] Recovered invalid scene boundary for chunk \${i}: start=\${chunk_orig_start}, new_end=\${chunk_orig_end}\`);
                    } else {
                        chunk_orig_end = state.originalVideoDuration;
                        console.log(\`[AI] Recovered invalid scene boundary for chunk \${i}: start=\${chunk_orig_start}, new_end=video_end(\${chunk_orig_end})\`);
                    }
                }`;

const replacement = `                if (chunk_orig_end <= chunk_orig_start) {
                    chunk_orig_end = chunk_orig_start + Math.max(0.1, chunk.final_dur || 1.0);
                    if (chunk_orig_end > state.originalVideoDuration) {
                        chunk_orig_end = state.originalVideoDuration;
                    }
                    console.log(\`[AI] Recovered invalid scene boundary for chunk \${i}: start=\${chunk_orig_start}, new_end=\${chunk_orig_end} (based on chunk dur)\`);
                }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Boundary logic patched successfully.");
} else {
    console.log("Target string not found in processor.js");
}
