import fs from 'fs';
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const searchStr1 = `            const createTimelineSegment = (start, end, scene_start, scene_end, text) => {
                let target_dur = end - start;
                if (target_dur <= 0.001) return;
                
                if (!Number.isFinite(scene_start)) scene_start = 0;
                if (!Number.isFinite(scene_end)) scene_end = scene_start + 0.1;
                
                if (scene_end <= scene_start) {
                    const old_scene_end = scene_end;
                    scene_end = scene_start + 0.1;
                    console.log(\`[AI] Adjusted invalid scene boundary for "\${text}": start=\${scene_start}, end=\${old_scene_end} -> \${scene_end}\`);
                }
                
                if (scene_end > state.originalVideoDuration) {
                    scene_end = state.originalVideoDuration;
                    if (scene_start >= scene_end) {
                        scene_start = Math.max(0, scene_end - 0.1);
                    }
                }
                
                let desired_orig_dur = scene_end - scene_start;`;

if (content.includes(searchStr1)) {
    console.log("Found searchStr1");
} else {
    console.log("Could NOT find searchStr1");
}
