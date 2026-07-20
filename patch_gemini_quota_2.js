import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `            if (!success) {
                throw new Error(\`Gemini translation failed after retries for batch \${Math.floor(i / batchSize) + 1}. Last error: \${lastError?.message}\`);
            }`;

const replacement = `            if (!success) {
                if (lastError && lastError.message.includes('Gemini API daily quota has been exceeded')) {
                    throw new Error('Gemini API daily quota has been exceeded. Please try again after the quota resets or use a billing-enabled Gemini API project.');
                }
                throw new Error(\`Gemini translation failed after retries for batch \${Math.floor(i / batchSize) + 1}. Last error: \${lastError?.message}\`);
            }`;

if (content.includes("throw new Error(\`Gemini translation failed after retries")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched Gemini quota error message bubbler successfully.");
} else {
    console.log("Target not found.");
}
