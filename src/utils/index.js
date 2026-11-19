
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
    const blocks = normalized.trim().split(/\n\s*\n/);
    const timeLineRegex = /^\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})(?:\s.*)?$/;
    const toSeconds = (h, m, s, ms) => {
        const hh = parseInt(h, 10);
        const mm = parseInt(m, 10);
        const ss = parseInt(s, 10);
        const msec = parseInt(String(ms).padEnd(3, '0').slice(0, 3), 10);
        if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss) || !Number.isFinite(msec)) return NaN;
        if (mm >= 60 || ss >= 60) return NaN;
        return hh * 3600 + mm * 60 + ss + msec / 1000;
    };

    const results = [];
    for (const block of blocks) {
        const lines = block.split('\n');
        let timeIdx = -1;
        let match = null;
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(timeLineRegex);
            if (m) {
                timeIdx = i;
                match = m;
                break;
            }
        }
        if (!match || timeIdx === -1) continue;

        const startSec = toSeconds(match[1], match[2], match[3], match[4]);
        const endSec = toSeconds(match[5], match[6], match[7], match[8]);
        if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec) {
            continue;
        }

        const joinedText = lines.slice(timeIdx + 1).join(' ').replace(/\s+/g, ' ').trim();
        if (!joinedText) continue;

        results.push({
            timestamp: [startSec, endSec],
            text: joinedText
        });
    }

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
