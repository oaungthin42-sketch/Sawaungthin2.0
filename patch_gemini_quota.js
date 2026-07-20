import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `                    if (!response.ok) {
                        const errorText = await response.text();
                        const status = response.status;
                        if (status === 429 || status >= 500 || status === 408) {
                            throw new Error(\`Gemini API temporary error (\${status}): \${errorText}\`);
                        }
                        throw new Error(\`Gemini API permanent error (\${status}): \${errorText}\`);
                    }`;

const replacement = `                    if (!response.ok) {
                        const errorText = await response.text();
                        const status = response.status;
                        if (status === 429) {
                            if (errorText.includes('GenerateRequestsPerDayPerProject') || 
                                errorText.includes('generate_content_free_tier_requests') || 
                                errorText.includes('Quota exceeded')) {
                                throw new Error(\`Gemini API permanent error (\${status}): Gemini API daily quota has been exceeded. Please try again after the quota resets or use a billing-enabled Gemini API project.\`);
                            } else {
                                throw new Error(\`Gemini API temporary error (\${status}): \${errorText}\`);
                            }
                        } else if (status >= 500 || status === 408) {
                            throw new Error(\`Gemini API temporary error (\${status}): \${errorText}\`);
                        }
                        throw new Error(\`Gemini API permanent error (\${status}): \${errorText}\`);
                    }`;

if (content.includes("const status = response.status;")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched Gemini quota error handling successfully.");
} else {
    console.log("Target not found.");
}
