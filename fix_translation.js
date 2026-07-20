import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const translateFunc = `export const translateWithGemini = async (originalTranscript, cachePath) => {
    try {
        if (cachePath && fs.existsSync(cachePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                if (Array.isArray(data) && data.length === originalTranscript.length) {
                    let valid = true;
                    for (let i = 0; i < data.length; i++) {
                        if (!data[i] || !data[i].text || typeof data[i].text !== 'string' || data[i].text.trim() === '' || !Array.isArray(data[i].timestamp) || data[i].timestamp.length !== 2) {
                            valid = false;
                            break;
                        }
                        if (data[i].timestamp[0] !== originalTranscript[i].timestamp[0] || data[i].timestamp[1] !== originalTranscript[i].timestamp[1]) {
                            valid = false;
                            break;
                        }
                    }
                    if (valid) {
                        console.log(\`[AI] Loaded translated transcript from cache: \${cachePath}\`);
                        return data;
                    }
                }
                console.warn("[AI] Translated transcript cache invalid, incomplete, or corrupted, translating again...");
            } catch(e) {
                console.warn("[AI] Translated transcript cache parse error, translating again...");
            }
        }
        
        console.log(\`[AI] Starting Gemini translation for \${originalTranscript.length} chunks...\`);
        const apiKey = (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY);
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY environment variable is missing.");
        }
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const endpoint = \`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${apiKey}\`;
        
        const systemInstruction = \`You are a professional Burmese movie recap translator.
Translate the provided original movie recap short narration transcript into natural, fluent Burmese suitable for Edge TTS narration.

STRICT TRANSLATION RULES:
1. Translate the original text into natural Burmese accurately.
2. Preserve the exact original meaning.
3. Do not add new information that does not exist in the original text.
4. Do not remove important information from the original text.
5. Do not shorten the text.
6. Do not make the text longer than necessary.
7. Keep the translation as close as possible to the original meaning, information, and overall length.
8. This is a movie recap short narration script. Translate the actual narration text directly.
9. Do NOT add titles or headings.
10. Do NOT add labels such as "ခေါင်းစဉ်", "ဇာတ်လမ်း", "အကျဉ်းချုပ်", or any other heading.
11. Do NOT invent forms of address or descriptions that are not present in the original text (e.g., do not add "လူငယ်", "မြေးလေး", "အဖိုး", "အဖွား", "ကောင်မလေး", "ကောင်လေး" unless explicitly in the text).
12. Do not rewrite the story into a different style.
13. Do not summarize.
14. Do not expand the story.
15. Do not add explanations, comments, notes, or translator remarks.
16. Do not add quotation marks unless they are required by the original meaning.
17. The text will be converted into narration audio using Edge TTS. Therefore, use natural spoken Burmese while preserving the original meaning and information.
18. Do not add extra punctuation or formatting that could make TTS sound unnatural.

Return only the requested translation output in strictly valid JSON array format.

Input format:
[
  {
    "index": 0,
    "text": "Original sentence 1"
  }
]

Output format MUST be EXACTLY valid JSON, mapping the same indexes:
[
  {
    "index": 0,
    "text": "မြန်မာဘာသာပြန်စာ ၁"
  }
]\`;

        const batchSize = 30;
        const translatedTranscript = [];
        
        for (let i = 0; i < originalTranscript.length; i += batchSize) {
            const batch = originalTranscript.slice(i, i + batchSize);
            const batchInput = batch.map((chunk, idx) => ({
                index: i + idx,
                text: chunk.text
            }));
            
            console.log(\`[AI] Translating batch \${Math.floor(i / batchSize) + 1} / \${Math.ceil(originalTranscript.length / batchSize)}...\`);
            const payload = {
                contents: [{
                    role: "user",
                    parts: [{ text: JSON.stringify(batchInput) }]
                }],
                systemInstruction: {
                    role: "system",
                    parts: [{ text: systemInstruction }]
                },
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.1
                }
            };
            let lastError = null;
            let success = false;
            
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: AbortSignal.timeout(60000)
                    });
                    if (!response.ok) {
                        const errorText = await response.text();
                        const status = response.status;
                        if (status === 429 || status >= 500 || status === 408) {
                            throw new Error(\`Gemini API temporary error (\${status}): \${errorText}\`);
                        }
                        throw new Error(\`Gemini API permanent error (\${status}): \${errorText}\`);
                    }
                    const data = await response.json();
                    
                    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0].text) {
                        throw new Error("Gemini API returned an empty or malformed response structure.");
                    }
                    const responseText = data.candidates[0].content.parts[0].text;
                    let parsedData;
                    try {
                        let cleanText = responseText.trim();
                        if (cleanText.startsWith('\`\`\`json')) {
                            cleanText = cleanText.substring(7);
                        } else if (cleanText.startsWith('\`\`\`')) {
                            cleanText = cleanText.substring(3);
                        }
                        if (cleanText.endsWith('\`\`\`')) {
                            cleanText = cleanText.substring(0, cleanText.length - 3);
                        }
                        parsedData = JSON.parse(cleanText.trim());
                    } catch (err) {
                        throw new Error("Failed to parse Gemini JSON output: " + err.message);
                    }
                    if (!Array.isArray(parsedData)) {
                        throw new Error("Gemini API did not return a JSON array.");
                    }
                    if (parsedData.length !== batch.length) {
                        throw new Error(\`Gemini API returned \${parsedData.length} chunks, expected \${batch.length}.\`);
                    }
                    // Map translations back
                    const tempBatch = [];
                    for (let j = 0; j < batch.length; j++) {
                        const expectedIndex = i + j;
                        const translatedItem = parsedData.find(item => item.index === expectedIndex);
                        
                        if (!translatedItem) {
                            throw new Error(\`Gemini API response is missing index \${expectedIndex}.\`);
                        }
                        
                        if (typeof translatedItem.text !== 'string' || translatedItem.text.trim() === '') {
                            throw new Error(\`Gemini API returned empty or invalid text for index \${expectedIndex}.\`);
                        }
                        // Verify duplicate indexes by checking if we already populated it in the main array
                        if (translatedTranscript[expectedIndex]) {
                            throw new Error(\`Duplicate processing detected for index \${expectedIndex}.\`);
                        }
                        tempBatch[j] = {
                            timestamp: originalTranscript[expectedIndex].timestamp,
                            text: translatedItem.text.trim()
                        };
                    }
                    
                    // Assign successfully parsed batch to main array
                    for (let j = 0; j < batch.length; j++) {
                        translatedTranscript[i + j] = tempBatch[j];
                    }
                    
                    success = true;
                    break; // Break retry loop
                } catch (err) {
                    console.warn(\`[AI] Gemini translation attempt \${attempt} failed: \${err.message}\`);
                    lastError = err;
                    
                    if (err.message.includes("permanent error")) {
                        break;
                    }
                    
                    if (attempt < 3) {
                        const backoff = Math.pow(2, attempt) * 1000;
                        console.log(\`[AI] Retrying Gemini in \${backoff}ms...\`);
                        await new Promise(r => setTimeout(r, backoff));
                    }
                }
            }
            
            if (!success) {
                throw new Error(\`Gemini translation failed after retries for batch \${Math.floor(i / batchSize) + 1}. Last error: \${lastError?.message}\`);
            }
        }
        
        // Final validations
        if (translatedTranscript.length !== originalTranscript.length) {
            throw new Error(\`Translated transcript length (\${translatedTranscript.length}) does not match original (\${originalTranscript.length}).\`);
        }
        
        for (let i = 0; i < translatedTranscript.length; i++) {
            const chunk = translatedTranscript[i];
            if (!chunk) {
                throw new Error(\`Translated transcript is missing index \${i}.\`);
            }
            if (typeof chunk.text !== 'string' || chunk.text.trim() === '') {
                throw new Error(\`Translated transcript text at index \${i} is invalid or empty.\`);
            }
            if (!Array.isArray(chunk.timestamp) || chunk.timestamp.length !== 2) {
                throw new Error(\`Translated transcript timestamp at index \${i} is invalid.\`);
            }
            if (chunk.timestamp[0] !== originalTranscript[i].timestamp[0] || chunk.timestamp[1] !== originalTranscript[i].timestamp[1]) {
                throw new Error(\`Translated transcript timestamp at index \${i} does not match original.\`);
            }
        }
        
        console.log(\`[AI] Gemini translation succeeded with \${translatedTranscript.length} chunks.\`);
        
        if (cachePath) {
            fs.writeFileSync(cachePath, JSON.stringify(translatedTranscript));
        }
        
        return translatedTranscript;
    } catch (err) {
        console.error("[AI] Error initiating translateWithGemini:", err);
        throw err;
    }
};

`;

content = content.replace('export const transcribeWav = (wavPath, cachePath, language = null) => {', translateFunc + 'export const transcribeWav = (wavPath, cachePath, language = null) => {');

fs.writeFileSync('src/ai/index.js', content);
