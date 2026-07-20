import fs from 'fs';

let content = fs.readFileSync('src/ffmpeg/index.js', 'utf8');

const target = `export const getDuration = (file) => new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, meta) => {
        if (err) return reject(err);
        resolve(meta.format.duration);
    });
});`;

const replacement = target + `

export const getStreamsDuration = (file) => new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, meta) => {
        if (err) return reject(err);
        let vDur = 0;
        let aDur = 0;
        if (meta.streams) {
            meta.streams.forEach(s => {
                if (s.codec_type === 'video' && s.duration) vDur = parseFloat(s.duration);
                if (s.codec_type === 'audio' && s.duration) aDur = parseFloat(s.duration);
            });
        }
        resolve({ videoDuration: vDur || meta.format.duration, audioDuration: aDur || meta.format.duration });
    });
});`;

if (content.includes("export const getDuration")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ffmpeg/index.js', content);
    console.log("Patched getStreamsDuration successfully.");
} else {
    console.log("Target not found.");
}
