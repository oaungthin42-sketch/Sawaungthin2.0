const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

if (!content.includes("import axios from 'axios';")) {
    content = "import axios from 'axios';\n" + content;
}

const translateRegex = /export const translateWithGemini = async [\s\S]*?;\n\nexport const generateNarrationTTS/m;

const newTranslate = `export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {
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

    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${modelName}:generateContent?key=\${apiKey}\`;

    const style = getSetting('TRANSLATION_STYLE') || 'balanced';
    const naturalness = getSetting('BURMESE_NATURALNESS') || 'balanced';
    const systemInstructionText = getTranslationSystemInstruction(style, naturalness);

    const inputPayload = originalTranscript.map((t, i) => ({
        index: i,
        text: t.text
    }));

    const maxRetries = 3;
    let attempt = 0;
    let delay = 1000;
    
    while (attempt < maxRetries) {
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
                timeout: 60000
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
            if (parsed.length !== originalTranscript.length) {
                throw new Error(\`Gemini response length (\${parsed.length}) does not match input length (\${originalTranscript.length}).\`);
            }

            const result = [];
            for (let i = 0; i < originalTranscript.length; i++) {
                const item = parsed.find(p => p.index === i);
                if (!item || typeof item.text !== 'string') {
                    throw new Error(\`Missing or invalid translation for chunk \${i}.\`);
                }
                result.push({
                    timestamp: originalTranscript[i].timestamp,
                    text: item.text
                });
            }

            if (cachePath) {
                fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
            }
            return result;

        } catch (err) {
            console.error(\`[AI] Gemini translation attempt \${attempt} failed: \${err.message}\`);
            const isTransient = !err.response || err.response.status >= 500 || err.response.status === 429 || err.code === 'ECONNABORTED';
            if (attempt === maxRetries || !isTransient) {
                throw new Error(\`Gemini translation failed after \${attempt} attempts. Last error: \${err.message}\`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
};

export const generateNarrationTTS`;

content = content.replace(translateRegex, newTranslate);
fs.writeFileSync(file, content);
console.log('Patched translateWithGemini');
