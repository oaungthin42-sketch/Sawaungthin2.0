import { EdgeTTS } from '@seepine/edge-tts';
import fs from 'fs';

async function run() {
    const ttsClient = new EdgeTTS();
    const res = await ttsClient.call('မင်္ဂလာပါ။');
    fs.writeFileSync('test.mp3', res.data);
    console.log("Written test.mp3");
}
run();
