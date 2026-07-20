import fs from 'fs';

let content = fs.readFileSync('src/routes/api.js', 'utf8');

const target = `router.get('/health', (req, res) => res.json({ status: 'ok' }));`;

const replacement = `router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.get('/diagnostic', (req, res) => {
    const key = (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY) || '';
    const maskedKey = key.length > 8 ? \`\${key.substring(0, 4)}...\${key.substring(key.length - 4)}\` : (key ? 'too-short' : 'missing');
    res.json({
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        hasKey: !!key,
        maskedKey,
        serverTime: new Date().toISOString()
    });
});`;

if (content.includes("router.get('/health'")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/routes/api.js', content);
    console.log("Patched API routes to include /diagnostic.");
} else {
    console.log("Target not found.");
}
