const fs = require('fs');

// 1. transcribe.py
let transcribe = fs.readFileSync('src/ai/transcribe.py', 'utf8');
transcribe = transcribe.replace(/WhisperModel\("tiny"/g, 'WhisperModel("base"');
fs.writeFileSync('src/ai/transcribe.py', transcribe, 'utf8');

// 2. translation.js
let translation = fs.readFileSync('src/ai/translation.js', 'utf8');
const rule8 = '8. Ensure sentences are easy for Burmese TTS to pronounce naturally without unnatural pauses or overloaded punctuation.';
const rule9 = '9. Character names and proper nouns: identify any character names or proper nouns in the original text (even if imperfectly transcribed) and render them as natural Burmese phonetic transliteration (e.g., a name like "John" becomes "ဂျွန်", "Maria" becomes "မာရီယာ") rather than dropping them or leaving them in the original script. Use the SAME transliteration consistently for the same character every time they are mentioned across the entire transcript — do not use different Burmese spellings for the same name in different lines.';
translation = translation.replace(rule8, rule8 + '\n' + rule9);
fs.writeFileSync('src/ai/translation.js', translation, 'utf8');

// 3. index.js translateWithGemini
let indexJs = fs.readFileSync('src/ai/index.js', 'utf8');

const regexFunc = /export const translateWithGemini = async \([\s\S]*?\n\};\n/;

const newFunc = `export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {
    if (!originalTranscript || originalTranscript.length === 0) return [];
    
    if (cachePath && fs.existsSync(cachePath)) {
        try {
            const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (cachedData.length === originalTranscript.length) {
                return cachedData;
            }
        } catch(e) {}
    }
    
    if (!apiKey) {
        throw new Error("Gemini API key is required for translation.");
    }
    
    if (apiKey === 'bypass') return originalTranscript;
    
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${modelName}:generateContent?key=\${apiKey}\`;
    
    const style = getSetting('TRANSLATION_STYLE') || 'balanced';
    const naturalness = getSetting('BURMESE_NATURALNESS') || 'balanced';
    
    const systemInstructionText = getTranslationSystemInstruction(style, naturalness);
    
    const BATCH_SIZE = 40;
    const finalResult = [];
    
    for (let batchStart = 0; batchStart < originalTranscript.length; batchStart += BATCH_SIZE) {
        const batch = originalTranscript.slice(batchStart, batchStart + BATCH_SIZE);
        const inputPayload = batch.map((t, i) => ({
            index: batchStart + i,
            text: t.text
        }));
        
        const maxRetries = 3;
        let attempt = 0;
        let delay = 1000;
        let batchSuccess = false;
        
        while (attempt < maxRetries && !batchSuccess) {
            attempt++;
            try {
                const response = await axios.post(url, {
                    system_instruction: {
                        parts: [{ text: systemInstructionText }]
                    },
                    contents: [{
                        role: "user",
                        parts: [{ text: JSON.stringify(inputPayload) }]
                    }],
                    generationConfig: {
                        response_mime_type: "application/json",
                        temperature: 0.2
                    }
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 120000
                });
                
                const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!textResponse) throw new Error("Empty response from Gemini.");
                
                let parsed;
                try {
                    parsed = JSON.parse(textResponse);
                } catch (e) {
                    throw new Error("Invalid JSON response from Gemini.");
                }
                
                if (!Array.isArray(parsed)) throw new Error("Gemini response is not an array.");
                if (parsed.length !== batch.length) {
                    throw new Error(\`Gemini response length (\${parsed.length}) does not match input batch length (\${batch.length}).\`);
                }
                
                for (let i = 0; i < batch.length; i++) {
                    const globalIndex = batchStart + i;
                    const item = parsed.find(p => p.index === globalIndex);
                    if (!item || typeof item.text !== 'string') {
                        throw new Error(\`Missing or invalid translation for chunk \${globalIndex}.\`);
                    }
                    finalResult.push({
                        timestamp: originalTranscript[globalIndex].timestamp,
                        text: item.text
                    });
                }
                batchSuccess = true;
            } catch (err) {
                let errorMsg = err.message;
                if (err.response && err.response.status === 404) {
                    errorMsg = \`Model '\${modelName}' not found or unsupported (HTTP 404). Please configure a valid GEMINI_MODEL.\`;
                }
                console.error(\`[AI] Gemini translation attempt \${attempt} failed for batch \${batchStart}: \${errorMsg}\`);
                
                const isTransient = !err.response || err.response.status >= 500 || err.response.status === 429 || err.code === 'ECONNABORTED';
                if (attempt === maxRetries || !isTransient || (err.response && err.response.status === 404)) {
                    throw new Error(\`Gemini translation failed at batch \${batchStart}. \${errorMsg}\`);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            }
        }
    }
    
    if (cachePath) {
        fs.writeFileSync(cachePath, JSON.stringify(finalResult, null, 2));
    }
    
    return finalResult;
};
`;

indexJs = indexJs.replace(regexFunc, newFunc);
fs.writeFileSync('src/ai/index.js', indexJs, 'utf8');

console.log('patched all 3');
