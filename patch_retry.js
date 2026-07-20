import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `                    if (attempt < 3) {
                        const backoff = Math.pow(2, attempt) * 1000;
                        console.log(\`[AI] Retrying Gemini in \${backoff}ms...\`);
                        await new Promise(r => setTimeout(r, backoff));
                    }`;

const replacement = `                    if (attempt < 3) {
                        let backoff = Math.pow(2, attempt) * 1000;
                        if (lastError && lastError.message.includes('retry in')) {
                            const match = lastError.message.match(/retry in ([0-9.]+)s/);
                            if (match) {
                                const recommended = parseFloat(match[1]) * 1000;
                                if (recommended > backoff && recommended < 120000) {
                                    backoff = recommended + 1500;
                                }
                            }
                        }
                        console.log(\`[AI] Retrying Gemini in \${Math.round(backoff)}ms...\`);
                        await new Promise(r => setTimeout(r, backoff));
                    }`;

if (content.includes("const backoff = Math.pow(2, attempt) * 1000;")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched retry logic to respect retryDelay.");
} else {
    console.log("Target not found.");
}
