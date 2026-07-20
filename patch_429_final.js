import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `                        if (status === 429) {
                            if (errorText.includes('GenerateRequestsPerDayPerProject') || 
                                errorText.includes('generate_content_free_tier_requests')) {
                                throw new Error(\`Gemini API permanent error (\${status}): Gemini API daily quota has been exceeded. Please try again after the quota resets or use a billing-enabled Gemini API project.\`);
                            } else {
                                throw new Error(\`Gemini API temporary error (\${status}): \${errorText}\`);
                            }
                        }`;

const replacement = `                        if (status === 429) {
                            let isDailyQuota = errorText.includes('GenerateRequestsPerDayPerProject');
                            
                            const retryMatch = errorText.match(/retry in ([0-9.]+)s/);
                            if (retryMatch && parseFloat(retryMatch[1]) > 3600) {
                                isDailyQuota = true;
                            }
                            
                            if (errorText.includes('Quota exceeded') && (errorText.includes('limit: 1500') || errorText.includes('limit: 50'))) {
                                isDailyQuota = true;
                            }

                            if (isDailyQuota) {
                                throw new Error(\`Gemini API permanent error (\${status}): Gemini API daily quota has been exceeded. Please try again after the quota resets or use a billing-enabled Gemini API project.\`);
                            } else {
                                throw new Error(\`Gemini API temporary error (\${status}): \${errorText}\`);
                            }
                        }`;

if (content.includes("errorText.includes('generate_content_free_tier_requests')")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched 429 logic correctly to avoid RPM false positives.");
} else {
    console.log("Target not found.");
}
