import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `                            if (errorText.includes('Quota exceeded') && (errorText.includes('limit: 1500') || errorText.includes('limit: 50'))) {
                                isDailyQuota = true;
                            }`;

const replacement = `                            if (errorText.includes('Quota exceeded') && (errorText.includes('limit: 1500') || errorText.includes('limit: 50') || errorText.includes('limit: 0'))) {
                                isDailyQuota = true;
                            }`;

if (content.includes("errorText.includes('limit: 1500')")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched limit 0 handling.");
} else {
    console.log("Target not found.");
}
