const fs = require('fs');
let content = fs.readFileSync('src/ai/voices.js', 'utf8');

content = content.replace(/rate:\s*'\+22%'/g, "rate: '+38%'");
content = content.replace(/rate:\s*'\+18%'/g, "rate: '+35%'");
content = content.replace(/rate:\s*'\+16%'/g, "rate: '+33%'");
content = content.replace(/rate:\s*'\+17%'/g, "rate: '+34%'");

fs.writeFileSync('src/ai/voices.js', content, 'utf8');
console.log('patched voices');
