import { getSetting } from './settings.js';

export async function callLLM(options) {
    let systemInstruction = '';
    let contents = '';
    let model = '';
    let isJson = false;

    if (typeof options === 'string') {
        contents = options;
        if (arguments.length > 1 && typeof arguments[1] === 'string') {
            systemInstruction = arguments[1];
        }
    } else if (options && typeof options === 'object') {
        systemInstruction = options.systemInstruction || (options.config && options.config.systemInstruction) || '';
        contents = options.contents || options.prompt || options.text || '';
        model = options.model || '';
        if (options.jsonMode || options.responseMimeType === 'application/json' || (options.config && options.config.responseMimeType === 'application/json')) {
            isJson = true;
        }
    }

    const apiKey = getSetting('OPENROUTER_API_KEY') || process.env.OPENROUTER_API_KEY;
    if (!apiKey || !apiKey.trim()) {
        throw new Error("OpenRouter API key is not configured. Please add your OPENROUTER_API_KEY in Settings.");
    }

    let targetModel = model || getSetting('OPENROUTER_MODEL') || 'google/gemini-3.6-flash';
    if (!targetModel.includes('/')) {
        targetModel = `google/${targetModel}`;
    }

    const messages = [];
    if (systemInstruction && systemInstruction.trim()) {
        messages.push({
            role: 'system',
            content: systemInstruction.trim()
        });
    }

    const userContent = typeof contents === 'string' ? contents : JSON.stringify(contents);
    messages.push({
        role: 'user',
        content: userContent
    });

    const requestBody = {
        model: targetModel,
        messages
    };

    if (isJson) {
        requestBody.response_format = { type: 'json_object' };
    }

    const retryDelays = [5000, 15000, 30000];
    let response;

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey.trim()}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/aistudio',
                'X-Title': 'SuperClick'
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(120000)
        });

        if (response.ok) {
            break;
        }

        const status = response.status;
        const errorText = await response.text();
        const shouldRetry = (status === 429 || (status >= 500 && status < 600)) && attempt < retryDelays.length;

        if (shouldRetry) {
            console.warn(`[OpenRouter] Request failed with HTTP ${status}. Retrying in ${retryDelays[attempt] / 1000}s (attempt ${attempt + 1}/${retryDelays.length})...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
            continue;
        }

        // Do not retry other 4xx errors or if max retries exceeded
        throw new Error(`OpenRouter API error (${status}): ${errorText}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const rawText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!rawText || !rawText.trim()) {
        throw new Error("Empty response from OpenRouter API");
    }

    let cleanText = rawText.trim();
    if (isJson) {
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        } else if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
    }

    return {
        text: cleanText,
        content: cleanText,
        toString() {
            return cleanText;
        }
    };
}

export const generateContent = callLLM;
export const callOpenRouter = callLLM;
export default callLLM;
