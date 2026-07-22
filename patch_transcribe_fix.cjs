const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
`    return new Promise((resolve, reject) => {
        
        return resolve([
            { timestamp: [0, 5], text: "Test transcription part 1" },
            { timestamp: [10, 15], text: "Test transcription part 2" },
            { timestamp: [20, 25], text: "Test transcription part 3" },
            { timestamp: [30, 35], text: "Test transcription part 4" },
            { timestamp: [390, 395], text: "Test transcription part 5" }
        ]);
        let out = '';`,
`    return new Promise((resolve, reject) => {
        const child = spawn('python3', [pyPath, wavPath, cachePath || '']);
        let out = '';`);
fs.writeFileSync(file, content);
console.log('Patched');
