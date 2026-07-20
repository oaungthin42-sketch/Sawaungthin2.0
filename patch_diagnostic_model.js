import fs from 'fs';

let content = fs.readFileSync('src/routes/api.js', 'utf8');
content = content.replace("const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';", "const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';");
fs.writeFileSync('src/routes/api.js', content);
console.log("Patched API diagnostic model.");
