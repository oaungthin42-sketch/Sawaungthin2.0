import fs from 'fs';
const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
console.log(lines.slice(250, 430).join('\n'));
