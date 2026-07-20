import fs from 'fs';
let content = fs.readFileSync('src/ai/index.js', 'utf8');

content = content.replace(
    'fs.writeFileSync(cachePath, JSON.stringify(result.segments));',
    'fs.writeFileSync(cachePath, JSON.stringify(result.segments || result));'
);
content = content.replace(
    'resolve(result.segments);',
    'resolve(result.segments || result);'
);

fs.writeFileSync('src/ai/index.js', content);
