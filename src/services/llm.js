import { GoogleGenAI } from '@google/genai';
import { getSetting } from './settings.js';

function parseLLMOptions(options, ...extraArgs) {
    let systemInstruction = '';
    let contents = '';
    let model = '';
    let isJson = false;

    if (typeof options === 'string') {
        contents = options;
        if (extraArgs.length > 0 && typeof extraArgs[0] === 'string') {
            systemInstruction = extraArgs[0];
        }
    } else if (options && typeof options === 'object') {
        systemInstruction = options.systemInstruction || (options.config && options.config.systemInstruction) || '';
        contents = options.contents || options.prompt || options.text || '';
        model = options.model || '';
        if (options.jsonMode || options.responseMimeType === 'application/json' || (options.config && options.config.responseMimeType === 'application/json')) {
            isJson = true;
        }
    }

    return { systemInstruction, contents, model, isJson };
}

export function hasLLMKey() {
    const provider = (getSetting('LLM_PROVIDER') || 'gemini').trim().toLowerCase();
    if (provider === 'openrouter') {
        const key = getSetting('OPENROUTER_API_KEY') || process.env.OPENROUTER_API_KEY;
        return !!(key && key.trim());
    }
    const key = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    return !!(key && key.trim());
}

export async function callGemini(options, ...extraArgs) {
    const { systemInstruction, contents, model, isJson } = parseLLMOptions(options, ...extraArgs);

    const apiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
        throw new Error("Gemini API key is not configured. Please add your GEMINI_API_KEY in Settings.");
    }

    let targetModel = (model || getSetting('GEMINI_MODEL') || 'gemini-3.6-flash').trim();
    if (targetModel.startsWith('google/')) {
        targetModel = targetModel.replace(/^google\//, '');
    }

    const ai = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: {
            timeout: 120000,
            headers: {
                'User-Agent': 'aistudio-build'
            }
        }
    });

    const userContent = typeof contents === 'string' ? contents : JSON.stringify(contents);

    const config = {};
    if (systemInstruction && systemInstruction.trim()) {
        config.systemInstruction = systemInstruction.trim();
    }
    if (isJson) {
        config.responseMimeType = 'application/json';
    }

    const retryDelays = [5000, 15000, 30000];
    let response;

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
            console.log(`[LLM] Gemini request model=${targetModel} attempt=${attempt + 1}`);

            const timeoutPromise = new Promise((_, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error("Gemini API call timed out after 120s"));
                }, 120000);
                timer.unref?.();
            });

            response = await Promise.race([
                ai.models.generateContent({
                    model: targetModel,
                    contents: userContent,
                    config
                }),
                timeoutPromise
            ]);

            break;
        } catch (err) {
            const rawErr = `${err.status || ''} ${err.statusCode || ''} ${err.message || ''} ${JSON.stringify(err.error || '')} ${String(err)}`;
            const rawLower = rawErr.toLowerCase();
            const hasResourceExhausted = rawErr.includes('RESOURCE_EXHAUSTED') || rawLower.includes('resource_exhausted') || err.status === 429 || rawLower.includes('429');
            const hasDaily = rawErr.includes('PerDay') || rawLower.includes('per day') || rawErr.includes('GenerateRequestsPerDay');

            if (hasResourceExhausted && hasDaily) {
                const dailyErr = new Error("Gemini daily free quota is used up (requests per day). It resets at midnight Pacific time. Use another model, enable billing, or try again later.");
                dailyErr.isDailyQuota = true;
                dailyErr.status = 429;
                throw dailyErr;
            }

            const status = err.status || err.statusCode || (err.response && err.response.status);
            const errMsg = err.message ? err.message.toLowerCase() : String(err).toLowerCase();
            const is429 = status === 429 || errMsg.includes('429') || errMsg.includes('resource_exhausted') || errMsg.includes('rate limit');
            const is5xx = (status >= 500 && status < 600) || errMsg.includes('500') || errMsg.includes('503') || errMsg.includes('502') || errMsg.includes('504') || errMsg.includes('internal server') || errMsg.includes('unavailable');
            const shouldRetry = (is429 || is5xx) && attempt < retryDelays.length;

            if (shouldRetry) {
                console.warn(`[Gemini] Request failed (${status || err.message}). Retrying in ${retryDelays[attempt] / 1000}s (attempt ${attempt + 1}/${retryDelays.length})...`);
                await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
                continue;
            }

            throw err;
        }
    }

    const rawText = response && response.text;
    if (!rawText || !rawText.trim()) {
        throw new Error("Empty response from Gemini API");
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

export async function callOpenRouter(options, ...extraArgs) {
    const { systemInstruction, contents, model, isJson } = parseLLMOptions(options, ...extraArgs);

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

export async function callLLM(options, ...extraArgs) {
    const provider = (getSetting('LLM_PROVIDER') || 'gemini').trim().toLowerCase();
    if (provider === 'openrouter') {
        return callOpenRouter(options, ...extraArgs);
    }
    return callGemini(options, ...extraArgs);
}

export const generateContent = callLLM;
export default callLLM;
