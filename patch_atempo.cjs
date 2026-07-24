const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const oldLine = 'let filterChain = `[0:a]atempo=${speed.toFixed(4)},apad`;';
const newLine = `const audioTempo = Math.max(speed, 0.5);\n                            let filterChain = \`[0:a]atempo=\${audioTempo.toFixed(4)},apad\`;`;

content = content.replace(oldLine, newLine);
fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched atempo');
