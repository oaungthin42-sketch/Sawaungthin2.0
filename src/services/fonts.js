import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const fontCache = new Map();

const THAI_FAMILY_REGEX = /(thai|loma|garuda|norasi|waree|kinnari|umpush|sawasdee|laksaman|purisa|tlwg)/i;
const BURMESE_FAMILY_REGEX = /(padauk|myanmar)/i;

const KNOWN_THAI_PATHS = [
    '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansThai-Regular.otf',
    '/usr/share/fonts/truetype/noto/NotoSansThaiUI-Regular.ttf',
    '/usr/share/fonts/truetype/tlwg/Loma.ttf',
    '/usr/share/fonts/truetype/tlwg/Garuda.ttf'
];

const KNOWN_BURMESE_PATHS = [
    '/usr/share/fonts/truetype/padauk/Padauk-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansMyanmar-Regular.ttf'
];

function findFontRecursive(baseDir, regex) {
    if (!fs.existsSync(baseDir)) return null;
    try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(baseDir, entry.name);
            if (entry.isDirectory()) {
                const found = findFontRecursive(fullPath, regex);
                if (found) return found;
            } else if (entry.isFile() && regex.test(entry.name)) {
                return fullPath;
            }
        }
    } catch (e) {}
    return null;
}

function findFontForScript(script) {
    const isThai = script === 'thai';
    const pattern = isThai ? 'Noto Sans Thai' : 'Padauk';

    // a) Ask fontconfig via fc-match
    try {
        const output = execFileSync('fc-match', ['-f', '%{family}\n%{file}', pattern], {
            timeout: 3000,
            encoding: 'utf8'
        });
        const lines = output.trim().split('\n');
        const family = lines[0] || '';
        const filePath = lines[1] ? lines[1].trim() : '';

        const familyMatches = isThai
            ? THAI_FAMILY_REGEX.test(family)
            : BURMESE_FAMILY_REGEX.test(family);

        if (familyMatches && filePath && fs.existsSync(filePath)) {
            return filePath;
        }
    } catch (e) {}

    // b) Known paths
    const knownPaths = isThai ? KNOWN_THAI_PATHS : KNOWN_BURMESE_PATHS;
    for (const p of knownPaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    // c) Recursive search under /usr/share/fonts
    const searchRegex = isThai
        ? /NotoSansThai(UI)?-Regular\.(ttf|otf)$/i
        : /Padauk-Regular\.ttf$/i;

    const recursiveResult = findFontRecursive('/usr/share/fonts', searchRegex);
    if (recursiveResult) {
        return recursiveResult;
    }

    return null;
}

export const resolveWatermarkFont = (text, targetLanguage) => {
    const str = typeof text === 'string' ? text : '';
    const lang = targetLanguage === 'th' ? 'th' : 'my';

    const burmeseMatches = str.match(/[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/g) || [];
    const thaiMatches = str.match(/[\u0E00-\u0E7F]/g) || [];

    let script;
    let neededScript;

    if (burmeseMatches.length > 0 && thaiMatches.length > 0) {
        if (thaiMatches.length > burmeseMatches.length) {
            script = 'thai';
            neededScript = 'thai';
            console.warn('[WATERMARK-FONT] Watermark contains both Burmese and Thai characters. Selected Thai font based on character count; Burmese characters cannot be drawn.');
        } else {
            script = 'burmese';
            neededScript = 'burmese';
            console.warn('[WATERMARK-FONT] Watermark contains both Burmese and Thai characters. Selected Burmese font based on character count; Thai characters cannot be drawn.');
        }
    } else if (burmeseMatches.length > 0) {
        script = 'burmese';
        neededScript = 'burmese';
    } else if (thaiMatches.length > 0) {
        script = 'thai';
        neededScript = 'thai';
    } else {
        script = 'latin';
        neededScript = lang === 'th' ? 'thai' : 'burmese';
    }

    let fontPath;
    if (fontCache.has(neededScript)) {
        fontPath = fontCache.get(neededScript);
    } else {
        fontPath = findFontForScript(neededScript);
        fontCache.set(neededScript, fontPath);
    }

    console.log(`[WATERMARK-FONT] script=${script} lang=${lang} font=${fontPath || 'NONE'}`);

    return fontPath;
};
