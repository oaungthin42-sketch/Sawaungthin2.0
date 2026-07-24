const fs = require('fs');
const content = fs.readFileSync('src/ai/index.js', 'utf8');
const match = content.match(/(export const generateNarrationTTS = async [\s\S]*?\n\};\n)/);
if (match) {
    fs.writeFileSync('func_out.txt', match[1]);
}
