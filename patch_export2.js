import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const t1 = `'-c:a', 'aac',
                '-b:a', '128k',
                '-pix_fmt', 'yuv420p',`;
const r1 = `'-c:a', 'aac',
                '-b:a', '128k',
                '-filter:a', 'loudnorm=I=-14:LRA=11:TP=-1.5',
                '-pix_fmt', 'yuv420p',`;

if (content.includes(t1)) {
    content = content.replace(t1, r1);
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Patched export args successfully.");
} else {
    console.log("Target args not found.");
}
