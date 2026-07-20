import fs from 'fs';
const path = './src/ai/index.js';
let content = fs.readFileSync(path, 'utf8');

const target1 = `        const url = \`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${apiKey}\`;`;
const replacement1 = `
        let url = \`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${apiKey}\`;
        let headers = {
            'Content-Type': 'application/json'
        };
        if (apiKey && (apiKey.startsWith('ya29.') || apiKey.startsWith('AQ.'))) {
            url = \`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent\`;
            headers['Authorization'] = \`Bearer \${apiKey}\`;
        }
`;

content = content.replace(target1, replacement1);

// I also need to replace the fetch headers inside translateWithGemini
const target2 = `        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });`;
        
const replacement2 = `        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });`;

content = content.replace(target2, replacement2);
fs.writeFileSync(path, content);
console.log("Auth patched.");
