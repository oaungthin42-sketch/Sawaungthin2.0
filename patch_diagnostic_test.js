import fs from 'fs';

let content = fs.readFileSync('src/routes/api.js', 'utf8');

const target = `router.get('/diagnostic', (req, res) => {
    const key = (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY) || '';
    const maskedKey = key.length > 8 ? \`\${key.substring(0, 4)}...\${key.substring(key.length - 4)}\` : (key ? 'too-short' : 'missing');
    res.json({
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        hasKey: !!key,
        maskedKey,
        serverTime: new Date().toISOString()
    });
});`;

const replacement = `router.get('/diagnostic', async (req, res) => {
    const key = (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY) || '';
    const maskedKey = key.length > 8 ? \`\${key.substring(0, 4)}...\${key.substring(key.length - 4)}\` : (key ? 'too-short' : 'missing');
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    
    const diagData = {
        model,
        hasKey: !!key,
        maskedKey,
        serverTime: new Date().toISOString(),
        testRequestSuccess: false
    };

    if (key) {
        try {
            const endpoint = \`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${key}\`;
            const payload = {
                contents: [{ role: 'user', parts: [{ text: 'Hello, this is a test.' }] }]
            };
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            diagData.actualHttpStatus = response.status;
            
            if (!response.ok) {
                const errorText = await response.text();
                diagData.actualErrorMessage = errorText;
                
                try {
                    const errObj = JSON.parse(errorText);
                    if (errObj.error) {
                        diagData.actualErrorCode = errObj.error.code;
                        diagData.actualErrorStatus = errObj.error.status;
                        
                        if (errObj.error.details) {
                            const quotaFail = errObj.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure');
                            if (quotaFail && quotaFail.violations && quotaFail.violations.length > 0) {
                                diagData.quotaId = quotaFail.violations[0].quotaMetric || 'unknown';
                            }
                            
                            const retryInfo = errObj.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                            if (retryInfo) {
                                diagData.retryDelay = retryInfo.retryDelay;
                            }
                        }
                    }
                } catch(e) {}
            } else {
                diagData.testRequestSuccess = true;
            }
        } catch(e) {
            diagData.actualErrorMessage = e.message;
        }
    }
    
    res.json(diagData);
});`;

content = content.replace(target, replacement);
fs.writeFileSync('src/routes/api.js', content);
console.log("Patched API routes to include Gemini test in /diagnostic.");
