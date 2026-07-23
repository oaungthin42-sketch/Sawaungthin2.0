const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/export const computeSimilarity = async \(text1, text2\) => \{\n\s*return 1.0;\n\};/, `export const computeSimilarity = async (text1, text2) => {
    return null;
};`);

fs.writeFileSync(file, content);
console.log('Patched computeSimilarity');
