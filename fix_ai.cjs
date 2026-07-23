const fs = require('fs');

const content = fs.readFileSync('src/ai/index.js', 'utf8');
const lines = content.split('\n');

const part1 = lines.slice(0, 68).join('\n'); // Up to console.warn inside transcribeWav catch

const transcribeWavRest = `
            try { fs.unlinkSync(cachePath); } catch (err) {}
        }
    }
    
    return new Promise((resolve, reject) => {
        const pyScript = path.join(__dirname, 'transcriber.py');
        const pythonProcess = spawn('python3', [pyScript, wavPath]);

        let out = '';
        let errStr = '';
        
        pythonProcess.stdout.on('data', (data) => out += data.toString());
        pythonProcess.stderr.on('data', (data) => errStr += data.toString());
        
        pythonProcess.on('close', async (code) => {
            if (code !== 0) return reject(new Error(\`Transcribe failed: \${errStr}\`));
            try {
                const res = JSON.parse(out);
                const duration = await getDuration(wavPath);
                try {
                    validateTimestamps(res, duration);
                } catch(e) {
                    if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                    return reject(new Error(\`Pipeline Error: Transcription Stage Failed.\\nInput File: \${wavPath} (WAV audio)\\nUnderlying Error: \${e.message}\`));
                }
                if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(res));
                resolve(res);
            } catch(e) {
                if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                reject(new Error(e.message || 'Parse error from python'));
            }
        });
    });
};
`;

const translateWithGeminiStr = `
export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {
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

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
            let errorMsg = err.message;
            if (err.response && err.response.status === 404) {
                errorMsg = \`Model '\${modelName}' not found or unsupported (HTTP 404). Please configure a valid GEMINI_MODEL.\`;
            }
            console.error(\`[AI] Gemini translation attempt \${attempt} failed: \${errorMsg}\`);
            
            const isTransient = !err.response || err.response.status >= 500 || err.response.status === 429 || err.code === 'ECONNABORTED';
            if (attempt === maxRetries || !isTransient || (err.response && err.response.status === 404)) {
                throw new Error(\`Gemini translation failed. \${errorMsg}\`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
};
`;

const part2 = lines.slice(85).join('\n'); // Everything from line 86 onwards

fs.writeFileSync('src/ai/index.js', part1 + '\n' + transcribeWavRest + '\n' + translateWithGeminiStr + '\n' + part2);
