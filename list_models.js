import fs from 'fs';
const settingsPath = 'src/data/settings.json';
let keyToUse = process.env.GEMINI_API_KEY || '';
if (!keyToUse && fs.existsSync(settingsPath)) {
    const data = JSON.parse(fs.readFileSync(settingsPath));
    const item = data.find(i => i.key === 'GEMINI_API_KEY');
    if (item) keyToUse = item.value;
}

async function run() {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + keyToUse);
    const data = await res.json();
    if (data.models) {
        console.log(data.models.map(m => m.name).join('\n'));
    } else {
        console.log("No models returned:", data);
    }
}

run();
