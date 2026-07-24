const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');

async function main() {
    const tts = new EdgeTTS({ voice: 'en-US-AriaNeural', saveSubtitles: true });
    await tts.ttsPromise('Hello world. This is a test.', 'test.wav');
    const sub = JSON.parse(fs.readFileSync('test.wav.json', 'utf8'));
    console.log(sub);
}
main();
