import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

content = content.replace(
    /console.warn\(\`\[AI\] Gemini translation attempt \$\{attempt\} failed: \$\{err.message\}\`\);/g,
    "console.warn(`[AI] Gemini translation attempt ${attempt} failed: ${err.message.replace(/key=[A-Za-z0-9_\\-]+/gi, 'key=HIDDEN')}`);"
);

fs.writeFileSync('src/ai/index.js', content);
