const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

// 1. change the speed clamp
content = content.replace(/if \(speed < 0\.5\) speed = 0\.5;/g, "if (speed < 0.35) speed = 0.35;");

// 2. add the log
const tpadRegex = /(const filter = `\[0:v\]setpts=\$\{\(1\/speed\)\.toFixed\(4\)\}\*\(PTS-STARTPTS\),tpad=stop_mode=clone:stop_duration=\$\{target_dur\},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p\[v\]`;)/;
const newLog = `const freezeAmount = t.target_dur - ((t.scene_end - t.scene_start) / speed);
                    console.log(\`[FREEZE-PADDING] segment \${globalIdx}: speed=\${speed.toFixed(2)}, freeze_padding=\${freezeAmount.toFixed(2)}s\`);
                    $1`;

content = content.replace(tpadRegex, newLog);

fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched processor 2');
