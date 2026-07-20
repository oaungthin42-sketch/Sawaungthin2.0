import fs from 'fs';

let content = fs.readFileSync('src/ffmpeg/index.js', 'utf8');

const safeWriteFunction = `
const safeWriteCache = (cachePath, data) => {
    if (!cachePath) return;
    const tmpPath = cachePath + '.tmp';
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
        fs.renameSync(tmpPath, cachePath);
    } catch(e) {
        console.warn('[FFmpeg] Failed to write cache safely:', e.message);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
};
`;

if (!content.includes('safeWriteCache')) {
    content = content.replace("export const getDuration =", safeWriteFunction + "\nexport const getDuration =");
}

content = content.replace(
    /if \(cachePath\) \{\s*fs.writeFileSync\(cachePath, JSON.stringify\(scenes, null, 2\)\);\s*\}/g,
    "safeWriteCache(cachePath, scenes);"
);

fs.writeFileSync('src/ffmpeg/index.js', content);
