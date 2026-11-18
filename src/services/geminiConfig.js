import { getSetting } from './settings.js';

export const GEMINI_MODEL = 'gemini-3.6-flash';

export const getGeminiModel = () => {
    const v = (getSetting('GEMINI_MODEL') || '').trim();
    return (v || GEMINI_MODEL).replace(/^google\//, '');
};
