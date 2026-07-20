import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

content = content.replace("let chunkDur = await getDuration(rawChunk);", "let chunkDur = parseFloat(await getDuration(rawChunk));");

fs.writeFileSync('src/ai/index.js', content);
console.log("Patched getDuration parsing.");
