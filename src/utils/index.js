
import fs from 'fs';

export function formatTime(seconds) {
    const d = new Date(seconds * 1000);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s},${ms}`;
}

export function generateSRT(chunks) {
    let srt = '';
    chunks.forEach((chunk, index) => {
        let start = chunk.timestamp[0];
        let end = chunk.timestamp[1] || start + 2; 
        srt += `${index + 1}\n`;
        srt += `${formatTime(start)} --> ${formatTime(end)}\n`;
        srt += `${chunk.text.trim()}\n\n`;
    });
    return srt;
}

export function parseSRT(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const timeLineRegex = /^\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})(?:\s.*)?$/;
    const leadingMarkerRegex = /^\s*[\[\(]?[0-9\u1040-\u1049]{1,4}[\]\)]?\s*(?:[.:)\-\u104A\u104B]|\s-\s)\s*/;
    const trailingZwNumberRegex = /[\u200B\u200C\u200D\u2060\uFEFF]+\s*[0-9\u1040-\u1049]{1,4}\s*$/;
    const zeroWidthCharsRegex = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
    const trailingTokenRegex = /^(.+?)\s+([0-9\u1040-\u1049]{1,4})$/;

    const toAsciiDigits = (value) => value.replace(/[\u1040-\u1049]/g, (ch) => String(ch.charCodeAt(0) - 0x1040));

    const toSeconds = (h, m, s, ms) => {
        const hh = parseInt(h, 10);
        const mm = parseInt(m, 10);
        const ss = parseInt(s, 10);
        const msec = parseInt(String(ms).padEnd(3, '0').slice(0, 3), 10);
        if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss) || !Number.isFinite(msec)) return NaN;
        if (mm >= 60 || ss >= 60) return NaN;
        return hh * 3600 + mm * 60 + ss + msec / 1000;
    };

    const isNextNonEmptyTimeLine = (fromIndex) => {
        for (let j = fromIndex + 1; j < lines.length; j++) {
            const trimmed = lines[j].trim();
            if (!trimmed) continue;
            return timeLineRegex.test(trimmed);
        }
        return false;
    };

    const cleanSubtitleText = (rawText) => {
        const original = String(rawText ?? '');
        let cleaned = original.replace(trailingZwNumberRegex, '');
        cleaned = cleaned.replace(zeroWidthCharsRegex, '');
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        if (cleaned) return cleaned;
        return original.replace(zeroWidthCharsRegex, '').replace(/\s+/g, ' ').trim() || original.trim();
    };

    const stripLeadingMarkers = (rawText) => {
        const original = cleanSubtitleText(rawText);
        if (!original) return '';
        let stripped = original;
        for (let pass = 0; pass < 2; pass++) {
            const next = stripped.replace(leadingMarkerRegex, '');
            if (next === stripped) break;
            stripped = next;
        }
        stripped = stripped.trim();
        return stripped || original;
    };

    const results = [];
    let current = null;
    let firstExplicitIndex = null;
    let entryCount = 0;

    const finishCurrent = () => {
        if (!current) return;
        const joinedText = current.textLines.join(' ').replace(/\s+/g, ' ').trim();
        if (joinedText) {
            results.push({
                timestamp: [current.startSec, current.endSec],
                text: stripLeadingMarkers(cleanSubtitleText(joinedText))
            });
        }
        current = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;

        const match = trimmed.match(timeLineRegex);
        if (match) {
            finishCurrent();
            entryCount++;
            const startSec = toSeconds(match[1], match[2], match[3], match[4]);
            const endSec = toSeconds(match[5], match[6], match[7], match[8]);
            if (Number.isFinite(startSec) && Number.isFinite(endSec) && startSec >= 0 && endSec > startSec) {
                current = { startSec, endSec, textLines: [] };
            } else {
                current = null;
            }
            continue;
        }

        const bareDigits = trimmed.replace(zeroWidthCharsRegex, '').trim();
        if (/^\d+$/.test(bareDigits) && isNextNonEmptyTimeLine(i)) {
            if (entryCount === 0 && firstExplicitIndex === null) {
                firstExplicitIndex = parseInt(bareDigits, 10);
            }
            continue;
        }

        if (current) {
            let lineText = trimmed;
            if (isNextNonEmptyTimeLine(i)) {
                const baseIndex = firstExplicitIndex !== null ? firstExplicitIndex : 1;
                const nextEntryIndex = baseIndex + entryCount;
                const withoutZw = cleanSubtitleText(lineText);
                const tokMatch = withoutZw.match(trailingTokenRegex);
                if (tokMatch && nextEntryIndex >= 2) {
                    const tokNum = parseInt(toAsciiDigits(tokMatch[2]), 10);
                    if (tokNum === nextEntryIndex && tokMatch[1].trim()) {
                        lineText = tokMatch[1].trim();
                    }
                }
            }
            current.textLines.push(lineText);
        }
    }

    finishCurrent();

    results.sort((a, b) => a.timestamp[0] - b.timestamp[0] || a.timestamp[1] - b.timestamp[1]);
    return results;
}

export function cleanupFiles(files) {
    files.forEach(f => {
        if (f && fs.existsSync(f)) {
            try { fs.unlinkSync(f); } catch (e) { console.error('Failed to cleanup', f, e.message); }
        }
    });
}

export function safeMoveFile(src, dest) {
    try {
        fs.renameSync(src, dest);
    } catch (err) {
        if (err.code === 'EXDEV') {
            fs.copyFileSync(src, dest);
            fs.unlinkSync(src);
        } else {
            throw err;
        }
    }
}

export const computeCreditsForDuration = (durationSeconds) => {
    return Math.max(1, Math.ceil((durationSeconds - 15) / 60));
};
