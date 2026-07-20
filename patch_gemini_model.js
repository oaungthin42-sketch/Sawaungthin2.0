import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');
content = content.replace("const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';", "const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';");
fs.writeFileSync('src/ai/index.js', content);

let content2 = fs.readFileSync('src/routes/api.js', 'utf8');
content2 = content2.replace("const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';", "const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';");
fs.writeFileSync('src/routes/api.js', content2);

console.log("Patched Gemini model to gemini-3.5-flash successfully.");
