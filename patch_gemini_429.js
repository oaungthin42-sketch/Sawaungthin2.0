import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `                        if (status === 429) {
                            if (errorText.includes('GenerateRequestsPerDayPerProject') || 
                                errorText.includes('generate_content_free_tier_requests') || 
                                errorText.includes('Quota exceeded')) {
                                throw new Error(\`Gemini API permanent error (\${status}): Gemini API daily quota has been exceeded. Please try again after the quota resets or use a billing-enabled Gemini API project.\`);
                            } else {
                                throw new Error(\`Gemini API temporary error (\${status}): \${errorText}\`);
                            }
                        }`;

const replacement = `                        if (status === 429) {
                            if (errorText.includes('GenerateRequestsPerDayPerProject') || 
                                errorText.includes('generate_content_free_tier_requests')) {
                                throw new Error(\`Gemini API permanent error (\${status}): Gemini API daily quota has been exceeded. Please try again after the quota resets or use a billing-enabled Gemini API project.\`);
                            } else {
                                throw new Error(\`Gemini API temporary error (\${status}): \${errorText}\`);
                            }
                        }`;

if (content.includes("errorText.includes('Quota exceeded')")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched Gemini 429 logic successfully.");
} else {
    console.log("Target not found.");
}
