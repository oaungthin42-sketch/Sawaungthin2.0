import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const targetStr = `        const apiKey = (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY);
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY environment variable is missing.");
        }
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
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

        const batchSize = 30;`;

const replacement = `        const apiKey = (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY);
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY environment variable is missing.");
        }
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
        const endpoint = \`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${apiKey}\`;
        
        const { getTranslationSystemInstruction } = await import('./translation.js');
        const systemInstruction = getTranslationSystemInstruction();

        const batchSize = 30;`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Successfully patched src/ai/index.js");
} else {
    console.log("Could not find the target string in src/ai/index.js");
}
