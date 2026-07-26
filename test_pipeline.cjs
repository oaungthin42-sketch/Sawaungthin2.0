const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const tmpDir = process.cwd();
const finalOutPath = path.join(tmpDir, 'test_input.mp4');

const runFFmpeg = (args) => new Promise((resolve, reject) => {
    const ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
    const proc = spawn(ffmpegPath, args);
    let errLog = '';
    proc.stderr.on('data', d => errLog += d.toString());
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(errLog)));
});

async function run() {
    console.log("Running Blur...");
    const blurArgs = [
        '-i', finalOutPath,
        '-filter_complex', '[0:v]split=2[main0][blur0];[blur0]crop=108:192:108:192,boxblur=10:10[blurred0];[main0][blurred0]overlay=108:192[v0]',
        '-map', '[v0]',
        '-map', '0:a?',
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-y', 'test_blur.mp4'
    ];
    await runFFmpeg(blurArgs);

    console.log("Running Subtitle...");
    const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans Myanmar,50,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,8,0,8,100,100,1500,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,This is a test subtitle line\\Nwith wrapping hopefully working Myanmar script: မင်္ဂလာပါ။
`;
    fs.writeFileSync('test.ass', assHeader);

    const subArgs = [
        '-i', 'test_blur.mp4',
        '-filter_complex', `[0:v]subtitles='test.ass'[v]`,
        '-map', '[v]',
        '-map', '0:a?',
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-y', 'test_sub.mp4'
    ];
    await runFFmpeg(subArgs);
    console.log("Done");
}
run().catch(console.error);
