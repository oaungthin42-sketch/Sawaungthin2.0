const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = '/app/applet/node_modules/ffmpeg-static/ffmpeg';
const tmpDir = path.join(__dirname, 'test_mux_tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const vid = 'data/test_10s.mp4';
const out1 = path.join(tmpDir, 'seg_0.ts');
const out2 = path.join(tmpDir, 'seg_1.ts');

execSync(`${ffmpeg} -ss 0.000 -t 2.000 -i ${vid} -filter_complex "[0:v]scale=1080:1920,fps=30,format=yuv420p[v]" -map "[v]" -c:v libx264 -preset ultrafast -f mpegts -y ${out1}`);
execSync(`${ffmpeg} -ss 2.000 -t 2.000 -i ${vid} -filter_complex "[0:v]scale=1080:1920,fps=30,format=yuv420p[v]" -map "[v]" -c:v libx264 -preset ultrafast -f mpegts -y ${out2}`);

const concatFile = path.join(tmpDir, 'concat.txt');
fs.writeFileSync(concatFile, `file '${out1}'\nfile '${out2}'`);

const aud = path.join(tmpDir, 'audio.wav');
execSync(`${ffmpeg} -f lavfi -i anullsrc=r=44100:cl=stereo -t 4.0 -y ${aud}`);

try {
    execSync(`${ffmpeg} -f concat -safe 0 -i ${concatFile} -i ${aud} -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -shortest -movflags +faststart -y ${path.join(tmpDir, 'final.mp4')}`);
    console.log('Success!');
} catch (e) {
    console.error('Failed!', e.message);
}
