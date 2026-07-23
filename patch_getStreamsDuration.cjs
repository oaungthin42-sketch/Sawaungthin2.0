const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ffmpeg/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /export const getStreamsDuration = \(file\) => new Promise\(\(resolve, reject\) => \{[\s\S]*?\}\);\n\}\);/m;
const replacement = `export const getStreamsDuration = (file) => new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, meta) => {
        if (err) return reject(err);
        let vDur = 0;
        let aDur = 0;
        let formatDur = 0;
        let hasVideo = false;
        let hasAudio = false;
            
        if (meta.format && meta.format.duration !== undefined && meta.format.duration !== 'N/A') {
            const parsedFormatDur = parseFloat(meta.format.duration);
            if (Number.isFinite(parsedFormatDur)) {
                formatDur = parsedFormatDur;
            }
        }
            
        if (meta.streams) {
            meta.streams.forEach(s => {
                if (s.codec_type === 'video') {
                    hasVideo = true;
                    if (s.duration && s.duration !== 'N/A') {
                        const parsed = parseFloat(s.duration);
                        if (Number.isFinite(parsed)) vDur = parsed;
                    }
                }
                if (s.codec_type === 'audio') {
                    hasAudio = true;
                    if (s.duration && s.duration !== 'N/A') {
                        const parsed = parseFloat(s.duration);
                        if (Number.isFinite(parsed)) aDur = parsed;
                    }
                }
            });
        }
            
        resolve({
            hasVideo,
            hasAudio,
            videoDuration: vDur,
            audioDuration: aDur,
            formatDuration: formatDur,
            videoSource: vDur > 0 ? 'stream' : (formatDur > 0 ? 'format' : 'unknown'),
            audioSource: aDur > 0 ? 'stream' : (formatDur > 0 ? 'format' : 'unknown'),
            effectiveVideoDuration: vDur > 0 ? vDur : formatDur,
            effectiveAudioDuration: aDur > 0 ? aDur : formatDur
        });
    });
});`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched getStreamsDuration');
