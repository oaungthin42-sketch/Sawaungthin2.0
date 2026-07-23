import fs from 'fs';
import path from 'path';
import { validateTimestamps, translateWithGemini } from './src/ai/index.js';
import { getJobKeys } from './src/services/jobManager.js';
import axios from 'axios';

// Mock axios
axios.post = async (url, data, config) => {
    const text = data.contents[0].parts[0].text;
    const input = JSON.parse(text);
    
    if (global.geminiMockAction === 'valid') {
        return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify(input.map(i => ({ index: i.index, text: "Translated " + i.text }))) }] } }] } };
    }
    if (global.geminiMockAction === 'invalid_json') {
        return { data: { candidates: [{ content: { parts: [{ text: "This is not JSON" }] } }] } };
    }
    if (global.geminiMockAction === 'missing_chunk') {
        return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify([input[0]]) }] } }] } };
    }
    if (global.geminiMockAction === 'extra_chunk') {
        const out = input.map(i => ({ index: i.index, text: "T" }));
        out.push({ index: 99, text: "Extra" });
        return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] } };
    }
    if (global.geminiMockAction === 'transient_retry') {
        if (!global.retryCount) global.retryCount = 0;
        global.retryCount++;
        if (global.retryCount < 3) {
            const err = new Error("Network Error");
            err.code = 'ECONNABORTED';
            throw err;
        }
        return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify(input.map(i => ({ index: i.index, text: "Translated" }))) }] } }] } };
    }
    return { data: {} };
};

const runTests = async () => {
    console.log("--- TIMESTAMP VALIDATION TESTS ---");
    const dur = 10.0;
    
    // 7. Normal transcript timestamps
    try {
        validateTimestamps([{ timestamp: [0, 5] }, { timestamp: [5, 9] }], dur);
        console.log("7. Normal transcript timestamps: PASS");
    } catch(e) { console.error("7. FAIL", e.message); }

    // 8. Small timestamp overshoot
    try {
        const res = validateTimestamps([{ timestamp: [9, 11] }], dur);
        if (res[0].timestamp[1] === dur) console.log("8. Small timestamp overshoot: PASS (clamped)");
        else console.error("8. FAIL: Not clamped correctly");
    } catch(e) { console.error("8. FAIL", e.message); }

    // 9. Large timestamp overshoot
    try {
        validateTimestamps([{ timestamp: [9, 13] }], dur);
        console.error("9. FAIL (should have thrown)");
    } catch(e) { console.log("9. Large timestamp overshoot: PASS"); }

    // 10. Overlapping timestamps
    try {
        validateTimestamps([{ timestamp: [0, 5] }, { timestamp: [4, 9] }], dur);
        console.error("10. FAIL (should have thrown)");
    } catch(e) { console.log("10. Overlapping timestamps: PASS"); }

    // 11. Negative timestamp
    try {
        validateTimestamps([{ timestamp: [-1, 5] }], dur);
        console.error("11. FAIL (should have thrown)");
    } catch(e) { console.log("11. Negative timestamp: PASS"); }

    // 12. Invalid end <= start
    try {
        validateTimestamps([{ timestamp: [5, 5] }], dur);
        console.error("12. FAIL (should have thrown)");
    } catch(e) { console.log("12. Invalid end <= start: PASS"); }

    console.log("\n--- GEMINI TRANSLATION TESTS ---");
    const orig = [{ timestamp: [0, 5], text: "Hello" }, { timestamp: [5, 9], text: "World" }];
    
    // 1. Valid Gemini translation
    try {
        global.geminiMockAction = 'valid';
        const res = await translateWithGemini(orig, null, 'fake-key');
        if (res.length === 2 && res[0].timestamp[0] === 0) console.log("1. Valid Gemini translation: PASS");
        else console.error("1. FAIL", res);
    } catch(e) { console.error("1. FAIL", e.message); }

    // 2. Invalid Gemini JSON
    try {
        global.geminiMockAction = 'invalid_json';
        await translateWithGemini(orig, null, 'fake-key');
        console.error("2. FAIL (should have thrown)");
    } catch(e) { console.log("2. Invalid Gemini JSON: PASS"); }

    // 3. Missing translated chunk
    try {
        global.geminiMockAction = 'missing_chunk';
        await translateWithGemini(orig, null, 'fake-key');
        console.error("3. FAIL (should have thrown)");
    } catch(e) { console.log("3. Missing translated chunk: PASS"); }

    // 4. Extra translated chunk
    try {
        global.geminiMockAction = 'extra_chunk';
        await translateWithGemini(orig, null, 'fake-key');
        console.error("4. FAIL (should have thrown)");
    } catch(e) { console.log("4. Extra translated chunk: PASS"); }

    // 5. Timestamp modification attempt
    try {
        global.geminiMockAction = 'valid';
        const res = await translateWithGemini(orig, null, 'fake-key');
        if (res[0].timestamp[0] === orig[0].timestamp[0]) console.log("5. Timestamp modification attempt: PASS (preserved)");
        else console.error("5. FAIL (timestamps modified)");
    } catch(e) { console.error("5. FAIL", e.message); }

    // 6. Gemini transient retry
    try {
        global.geminiMockAction = 'transient_retry';
        global.retryCount = 0;
        await translateWithGemini(orig, null, 'fake-key');
        if (global.retryCount === 3) console.log("6. Gemini transient retry: PASS");
        else console.error("6. FAIL", global.retryCount);
    } catch(e) { console.error("6. FAIL", e.message); }
};

runTests();
