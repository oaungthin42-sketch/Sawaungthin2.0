import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UploadCloud, FileText, Download, AlertCircle, CheckCircle, RotateCcw, Film, X, Copy, Check, Loader2, Sparkles, ArrowRightLeft } from 'lucide-react';
import axios from 'axios';

const GEMINI_TRANSLATION_INSTRUCTION = `Translate the subtitle text of the SRT below into natural spoken Burmese for TTS narration.
- Keep every subtitle number and every timestamp line EXACTLY unchanged. Same number of blocks. Never merge, split, skip or reorder blocks.
- Output valid SRT only. No notes or explanations.
- Use spoken endings (တယ်, ပါတယ်, ခဲ့တယ်, ဘူး). Never written endings (သည်, ပါသည်, ခဲ့သည်).
- Short, natural, varied sentences. Do not translate word by word. Do not repeat the same ending in consecutive lines.
- Faithful meaning only. Do not add, remove or summarize. Keep each line about as long as the original.
- Keep each person's gender and pronoun consistent across the whole file. Transliterate names the same way every time.
- Burmese script only: no English letters, and no digits. Write all numbers in Burmese words.`;

const GEMINI_TEXT_ONLY_INSTRUCTION = `Translate each numbered line below into natural spoken Burmese for TTS narration.
- Keep every line number and the "N. " prefix exactly as given. One output line per input line. Never merge, split, skip or reorder lines.
- Output the numbered lines only. No notes or explanations.
- Use spoken endings (တယ်, ပါတယ်, ခဲ့တယ်, ဘူး). Never written endings (သည်, ပါသည်, ခဲ့သည်).
- Short, natural, varied sentences. Do not translate word by word.
- Faithful meaning only. Do not add, remove or summarize. Keep each line about as long as the original.
- Keep each person's gender and pronoun consistent across all lines. Transliterate names the same way every time.
- Burmese script only: no English letters, and no digits. Write all numbers in Burmese words.`;

const SRT_PART_SIZE = 200;

interface SrtBlock {
    raw: string;
    number: number;
    timestampLine: string;
    textOnly: string;
}

const parseSrtBlocks = (rawText: string): SrtBlock[] => {
    if (!rawText || !rawText.trim()) return [];
    const normalized = rawText
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    const rawBlocks = normalized
        .split(/\n\s*\n/)
        .map((b) => b.trim())
        .filter(Boolean);

    const timeLineRegex = /^\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/;

    return rawBlocks.map((block, idx) => {
        const lines = block.split('\n');
        const timeIdx = lines.findIndex((line) => timeLineRegex.test(line));

        let subNumber = idx + 1;
        if (timeIdx > 0 && /^\s*\d+\s*$/.test(lines[timeIdx - 1])) {
            subNumber = parseInt(lines[timeIdx - 1].trim(), 10);
        } else if (timeIdx === -1 && /^\s*\d+\s*$/.test(lines[0])) {
            subNumber = parseInt(lines[0].trim(), 10);
        }

        const timestampLine = timeIdx !== -1 ? lines[timeIdx].trim() : '';

        let textLines: string[];
        if (timeIdx !== -1) {
            textLines = lines.slice(timeIdx + 1);
        } else if (/^\s*\d+\s*$/.test(lines[0])) {
            textLines = lines.slice(1);
        } else {
            textLines = lines;
        }

        const textOnly = textLines
            .map((l) => l.trim())
            .filter(Boolean)
            .join(' ');

        return {
            raw: block,
            number: subNumber,
            timestampLine,
            textOnly
        };
    });
};

const TRANSLATED_PARTS_STORAGE_KEY = 'superclick_translated_parts';

const TRAILING_ZW_NUMBER_REGEX = /[\u200B\u200C\u200D\u2060\uFEFF]+\s*[0-9\u1040-\u1049]{1,4}\s*$/;
const ZERO_WIDTH_CHARS_REGEX = /[\u200B\u200C\u200D\u2060\uFEFF]/g;

const cleanSubtitleText = (rawText: string): string => {
    const original = String(rawText ?? '');
    let cleaned = original.replace(TRAILING_ZW_NUMBER_REGEX, '');
    cleaned = cleaned.replace(ZERO_WIDTH_CHARS_REGEX, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    if (cleaned) return cleaned;
    return original.replace(ZERO_WIDTH_CHARS_REGEX, '').replace(/\s+/g, ' ').trim() || original.trim();
};

const cleanPastedTranslation = (raw: string): string => {
    return raw
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Strip trailing zero-width+digits only when preceded by visible text on the same line,
        // preserving standalone "\u200b2" index lines.
        .replace(/(\S[^\n]*?)[\u200B\u200C\u200D\u2060\uFEFF]+\s*[0-9\u1040-\u1049]{1,4}[ \t]*(?=\n|$)/g, '$1')
        .replace(ZERO_WIDTH_CHARS_REGEX, '')
        .replace(/^[ \t]*```[^\n]*$/gm, '')
        .replace(/```/g, '')
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .trim();
};

const LEADING_LIST_MARKER_REGEX = /^\s*[\[\(]?[0-9\u1040-\u1049]{1,4}[\]\)]?\s*(?:[.:)\-\u104A\u104B]|\s-\s)\s*/;

const stripLeadingListMarkers = (text: string): string => {
    const original = cleanSubtitleText(text);
    if (!original) return '';
    let stripped = original;
    for (let pass = 0; pass < 2; pass++) {
        const next = stripped.replace(LEADING_LIST_MARKER_REGEX, '');
        if (next === stripped) break;
        stripped = next;
    }
    stripped = stripped.trim();
    return stripped || original;
};

const toAsciiDigits = (value: string): string => {
    return value.replace(/[\u1040-\u1049]/g, (ch) => String(ch.charCodeAt(0) - 0x1040));
};

const SRT_FULL_TIME_LINE_REGEX = /^\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})(?:\s.*)?$/;

const toSrtSeconds = (h: string, m: string, s: string, ms: string): number => {
    const hh = parseInt(h, 10);
    const mm = parseInt(m, 10);
    const ss = parseInt(s, 10);
    const msec = parseInt(String(ms).padEnd(3, '0').slice(0, 3), 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss) || !Number.isFinite(msec)) return NaN;
    if (mm >= 60 || ss >= 60) return NaN;
    return hh * 3600 + mm * 60 + ss + msec / 1000;
};

const parseLenientSrtTime = (rawPart: string): number => {
    const cleaned = toAsciiDigits(rawPart.trim());
    const match = cleaned.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?(?:\s|$)/);
    if (!match) return NaN;
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    const ss = parseInt(match[3], 10);
    const msec = match[4] ? parseInt(match[4].padEnd(3, '0').slice(0, 3), 10) : 0;
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss) || !Number.isFinite(msec)) return NaN;
    if (mm >= 60 || ss >= 60) return NaN;
    return hh * 3600 + mm * 60 + ss + msec / 1000;
};

interface ParsedTranslationEntry {
    index: number | null;
    start: number;
    end: number;
    timeValid: boolean;
    text: string;
}

const parsePastedSrtWithArrows = (cleanedText: string): ParsedTranslationEntry[] => {
    const withoutZeroWidth = cleanedText.replace(ZERO_WIDTH_CHARS_REGEX, '');
    const lines = withoutZeroWidth.split('\n');

    const isNextNonEmptyTimeLine = (fromIndex: number): boolean => {
        for (let j = fromIndex + 1; j < lines.length; j++) {
            const trimmed = lines[j].trim();
            if (!trimmed) continue;
            return trimmed.includes('-->');
        }
        return false;
    };

    const entries: ParsedTranslationEntry[] = [];
    let pendingIndex: number | null = null;
    let current: {
        index: number | null;
        start: number;
        end: number;
        timeValid: boolean;
        textLines: string[];
    } | null = null;

    const finishCurrent = () => {
        if (!current) return;
        const joinedText = current.textLines.join(' ').replace(/\s+/g, ' ').trim();
        const cleanedText = stripLeadingListMarkers(cleanSubtitleText(joinedText));
        if (cleanedText) {
            entries.push({
                index: current.index,
                start: current.start,
                end: current.end,
                timeValid: current.timeValid,
                text: cleanedText
            });
        }
        current = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;

        if (trimmed.includes('-->')) {
            finishCurrent();
            const arrowIdx = trimmed.indexOf('-->');
            const start = parseLenientSrtTime(trimmed.slice(0, arrowIdx));
            const end = parseLenientSrtTime(trimmed.slice(arrowIdx + 3));
            const timeValid =
                Number.isFinite(start) &&
                Number.isFinite(end) &&
                start >= 0 &&
                end > start &&
                !(start === 0 && end === 0);

            current = {
                index: pendingIndex,
                start,
                end,
                timeValid,
                textLines: []
            };
            pendingIndex = null;
            continue;
        }

        if (/^[0-9\u1040-\u1049]+$/.test(trimmed) && isNextNonEmptyTimeLine(i)) {
            finishCurrent();
            const idx = parseInt(toAsciiDigits(trimmed), 10);
            pendingIndex = Number.isFinite(idx) ? idx : null;
            continue;
        }

        if (current) {
            current.textLines.push(trimmed);
        }
    }

    finishCurrent();
    return entries;
};

const NUMBERED_LINE_REGEX = /^(?:\[\s*([0-9\u1040-\u1049]+)\s*\]|([0-9\u1040-\u1049]+)\s*(?:(?:\.(?![0-9\u1040-\u1049]))|\)|(?::(?![0-9\u1040-\u1049]))|\u104A|\u104B|\s+-\s*|-\s+))\s*(.*)$/;

const parsePastedWithoutArrows = (cleanedText: string): ParsedTranslationEntry[] => {
    const lines = cleanedText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    const entries: ParsedTranslationEntry[] = [];
    let hasAnyNumberPrefix = false;
    let current: { index: number; textLines: string[] } | null = null;

    const finishCurrent = () => {
        if (!current) return;
        const joinedText = current.textLines.join(' ').replace(/\s+/g, ' ').trim();
        const cleanedEntryText = stripLeadingListMarkers(cleanSubtitleText(joinedText));
        if (cleanedEntryText) {
            entries.push({
                index: current.index,
                start: NaN,
                end: NaN,
                timeValid: false,
                text: cleanedEntryText
            });
        }
        current = null;
    };

    for (const line of lines) {
        const match = line.match(NUMBERED_LINE_REGEX);
        if (match) {
            hasAnyNumberPrefix = true;
            finishCurrent();
            const num = parseInt(toAsciiDigits(match[1] || match[2]), 10);
            const textPart = (match[3] || '').trim();
            current = {
                index: num,
                textLines: textPart ? [textPart] : []
            };
        } else if (hasAnyNumberPrefix && current) {
            current.textLines.push(line);
        }
    }

    finishCurrent();

    if (hasAnyNumberPrefix) {
        return entries;
    }

    return lines
        .map((line) => stripLeadingListMarkers(cleanSubtitleText(line)))
        .filter(Boolean)
        .map((text) => ({
            index: null,
            start: NaN,
            end: NaN,
            timeValid: false,
            text
        }));
};

interface MatchDiagnostics {
    parsed: number;
    byIndex: number;
    byTime: number;
    byOrder: number;
    unmatched: number;
    dups: number;
}

interface MatchTranslationResult {
    matchedMap: Record<number, string>;
    matchedCount: number;
    diagnostics: MatchDiagnostics;
    indexTimeWarning: boolean;
}

const matchTranslationEntries = (blocks: SrtBlock[], rawTranslation: string): MatchTranslationResult => {
    const cleaned = cleanPastedTranslation(rawTranslation);
    if (!cleaned) {
        return {
            matchedMap: {},
            matchedCount: 0,
            diagnostics: {
                parsed: 0,
                byIndex: 0,
                byTime: 0,
                byOrder: 0,
                unmatched: 0,
                dups: 0
            },
            indexTimeWarning: false
        };
    }

    const parsedEntries = cleaned.includes('-->')
        ? parsePastedSrtWithArrows(cleaned)
        : parsePastedWithoutArrows(cleaned);

    const N = blocks.length;
    const origStarts = blocks.map((b) => {
        const m = b.timestampLine.match(SRT_FULL_TIME_LINE_REGEX);
        return m ? toSrtSeconds(m[1], m[2], m[3], m[4]) : NaN;
    });
    const origIdxByNumber = new Map<number, number>();
    blocks.forEach((b, idx) => {
        if (!origIdxByNumber.has(b.number)) {
            origIdxByNumber.set(b.number, idx);
        }
    });

    const usedOriginal = new Array<boolean>(N).fill(false);
    const handledParsed = new Array<boolean>(parsedEntries.length).fill(false);
    const matchedMap: Record<number, string> = {};

    let byIndex = 0;
    let byTime = 0;
    let byOrder = 0;
    let unmatched = 0;
    let dups = 0;
    let indexTimeMismatchCount = 0;

    // 3a. Match by index (1..N), ignoring timestamps. First assignment wins; later duplicates counted in dups.
    for (let j = 0; j < parsedEntries.length; j++) {
        const entry = parsedEntries[j];
        if (entry.index !== null && Number.isInteger(entry.index) && entry.index >= 1 && entry.index <= N) {
            const targetOrigIdx = origIdxByNumber.has(entry.index)
                ? origIdxByNumber.get(entry.index)!
                : entry.index - 1;
            if (usedOriginal[targetOrigIdx]) {
                dups++;
                handledParsed[j] = true;
            } else {
                usedOriginal[targetOrigIdx] = true;
                handledParsed[j] = true;
                matchedMap[blocks[targetOrigIdx].number] = entry.text;
                byIndex++;

                const origStart = origStarts[targetOrigIdx];
                if (entry.timeValid && Number.isFinite(origStart) && Math.abs(entry.start - origStart) > 10) {
                    indexTimeMismatchCount++;
                }
            }
        }
    }

    // 3b. Entries without index: if timeValid, match nearest unused original block within 0.5 s.
    for (let j = 0; j < parsedEntries.length; j++) {
        if (handledParsed[j]) continue;
        const entry = parsedEntries[j];
        if (entry.index === null && entry.timeValid) {
            let bestIdx = -1;
            let bestDiff = Infinity;
            for (let i = 0; i < N; i++) {
                if (usedOriginal[i]) continue;
                const origStart = origStarts[i];
                if (!Number.isFinite(origStart)) continue;
                const diff = Math.abs(entry.start - origStart);
                if (diff <= 0.5 + 1e-6 && diff < bestDiff) {
                    bestDiff = diff;
                    bestIdx = i;
                }
            }
            if (bestIdx !== -1) {
                usedOriginal[bestIdx] = true;
                handledParsed[j] = true;
                matchedMap[blocks[bestIdx].number] = entry.text;
                byTime++;
            }
        }
    }

    // 3c. Otherwise, if number of pasted entries equals N, match remaining by order.
    for (let j = 0; j < parsedEntries.length; j++) {
        if (handledParsed[j]) continue;
        if (parsedEntries.length === N && !usedOriginal[j]) {
            usedOriginal[j] = true;
            handledParsed[j] = true;
            matchedMap[blocks[j].number] = parsedEntries[j].text;
            byOrder++;
        } else {
            unmatched++;
        }
    }

    const indexTimeWarning = byIndex > 0 && indexTimeMismatchCount / byIndex > 0.2;

    return {
        matchedMap,
        matchedCount: byIndex + byTime + byOrder,
        diagnostics: {
            parsed: parsedEntries.length,
            byIndex,
            byTime,
            byOrder,
            unmatched,
            dups
        },
        indexTimeWarning
    };
};

const formatNumberRanges = (nums: number[]): string => {
    if (nums.length === 0) return '';
    const sorted = [...nums].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i];
        if (curr === prev + 1) {
            prev = curr;
        } else {
            ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
            start = curr;
            prev = curr;
        }
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    return ranges.join(', ');
};

interface SrtExtractToolProps {
    onUseSrt?: () => void;
}

export const SrtExtractTool: React.FC<SrtExtractToolProps> = ({ onUseSrt }) => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'complete' | 'error'>('idle');
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [processProgress, setProcessProgress] = useState<number>(0);
    const [statusText, setStatusText] = useState<string>('');
    const [currentStepText, setCurrentStepText] = useState<string>('');
    const [jobId, setJobId] = useState<string | null>(null);
    const [lineCount, setLineCount] = useState<number | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [isDownloading, setIsDownloading] = useState<boolean>(false);

    const [srtRawText, setSrtRawText] = useState<string>('');
    const [srtLoading, setSrtLoading] = useState<boolean>(false);
    const [srtLoadError, setSrtLoadError] = useState<string>('');
    const [copiedKeys, setCopiedKeys] = useState<Record<string, boolean>>({});
    const [copyToast, setCopyToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const [instructionMode, setInstructionMode] = useState<'srt' | 'text'>('srt');
    const [uploadedSrtFilename, setUploadedSrtFilename] = useState<string | null>(null);
    const [pastedTranslation, setPastedTranslation] = useState<string>('');
    const [translatedMap, setTranslatedMap] = useState<Record<number, string>>({});
    const [convertError, setConvertError] = useState<string | null>(null);
    const [convertWarning, setConvertWarning] = useState<string | null>(null);
    const [lastDiagnostics, setLastDiagnostics] = useState<MatchDiagnostics | null>(null);

    const videoInputRef = useRef<HTMLInputElement>(null);
    const srtFileInputRef = useRef<HTMLInputElement>(null);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopPolling = () => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    };

    const clearToastTimer = () => {
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            stopPolling();
            clearToastTimer();
        };
    }, []);

    const srtBlocks = useMemo(() => parseSrtBlocks(srtRawText), [srtRawText]);

    const originalSig = useMemo(() => {
        if (srtBlocks.length === 0) return '';
        return `${srtBlocks.length}|${srtBlocks[0].timestampLine}|${srtBlocks[srtBlocks.length - 1].timestampLine}`;
    }, [srtBlocks]);

    useEffect(() => {
        if (!originalSig) {
            setTranslatedMap({});
            return;
        }
        try {
            const raw = localStorage.getItem(TRANSLATED_PARTS_STORAGE_KEY);
            if (!raw) {
                setTranslatedMap({});
                return;
            }
            const parsed = JSON.parse(raw);
            if (parsed && parsed.sig === originalSig && parsed.map && typeof parsed.map === 'object') {
                const restored: Record<number, string> = {};
                for (const [k, v] of Object.entries(parsed.map)) {
                    const num = Number(k);
                    if (Number.isInteger(num) && typeof v === 'string' && v.trim()) {
                        restored[num] = v;
                    }
                }
                setTranslatedMap(restored);
            } else {
                setTranslatedMap({});
            }
        } catch {
            setTranslatedMap({});
        }
    }, [originalSig]);

    const missingBlocks = useMemo(
        () => srtBlocks.filter((b) => !translatedMap[b.number]?.trim()),
        [srtBlocks, translatedMap]
    );
    const doneCount = srtBlocks.length - missingBlocks.length;
    const missingRangesText = useMemo(
        () => formatNumberRanges(missingBlocks.map((b) => b.number)),
        [missingBlocks]
    );

    const isAllTranslated = srtBlocks.length > 0 && doneCount === srtBlocks.length;

    const convertedSrt = useMemo(() => {
        if (!isAllTranslated) return '';
        return (
            srtBlocks
                .map((block) => {
                    const translated = stripLeadingListMarkers(cleanSubtitleText(translatedMap[block.number] || ''));
                    if (block.timestampLine) {
                        return `${block.number}\n${block.timestampLine}\n${translated}`;
                    }
                    return `${block.number}\n${translated}`;
                })
                .join('\n\n') + '\n'
        );
    }, [isAllTranslated, srtBlocks, translatedMap]);

    const convertedCount = isAllTranslated ? srtBlocks.length : 0;

    const convertedPreviewBlocks = useMemo(
        () => (convertedSrt ? parseSrtBlocks(convertedSrt).slice(0, 3) : []),
        [convertedSrt]
    );

    const srtParts = useMemo(() => {
        const parts: { partNumber: number; startNum: number; endNum: number; blocks: SrtBlock[] }[] = [];
        for (let i = 0; i < srtBlocks.length; i += SRT_PART_SIZE) {
            const slice = srtBlocks.slice(i, i + SRT_PART_SIZE);
            parts.push({
                partNumber: parts.length + 1,
                startNum: slice[0].number,
                endNum: slice[slice.length - 1].number,
                blocks: slice
            });
        }
        return parts;
    }, [srtBlocks]);

    const fetchSrtText = async (targetJobId: string) => {
        setSrtLoading(true);
        setSrtLoadError('');
        try {
            const response = await axios.get(`/api/download-srt/${targetJobId}`, {
                responseType: 'text',
                transformResponse: [(data) => data]
            });
            const text = typeof response.data === 'string' ? response.data : String(response.data ?? '');
            setSrtRawText(text);
        } catch (err: any) {
            let errMessage = 'SRT စာသား ဖတ်ရာတွင် အမှားဖြစ်ပွားခဲ့သည်။';
            if (typeof err?.response?.data === 'string') {
                try {
                    const parsed = JSON.parse(err.response.data);
                    if (parsed?.error) errMessage = parsed.error;
                } catch {
                    // ignore non-JSON error body
                }
            } else if (err?.response?.data?.error) {
                errMessage = err.response.data.error;
            }
            setSrtLoadError(errMessage);
        } finally {
            setSrtLoading(false);
        }
    };

    useEffect(() => {
        if (status !== 'complete' || !jobId) return;
        let active = true;
        setSrtLoading(true);
        setSrtLoadError('');
        axios.get(`/api/download-srt/${jobId}`, {
            responseType: 'text',
            transformResponse: [(data) => data]
        })
            .then((response) => {
                if (!active) return;
                const text = typeof response.data === 'string' ? response.data : String(response.data ?? '');
                setSrtRawText(text);
            })
            .catch((err: any) => {
                if (!active) return;
                let errMessage = 'SRT စာသား ဖတ်ရာတွင် အမှားဖြစ်ပွားခဲ့သည်။';
                if (typeof err?.response?.data === 'string') {
                    try {
                        const parsed = JSON.parse(err.response.data);
                        if (parsed?.error) errMessage = parsed.error;
                    } catch {
                        // ignore non-JSON error body
                    }
                } else if (err?.response?.data?.error) {
                    errMessage = err.response.data.error;
                }
                setSrtLoadError(errMessage);
            })
            .finally(() => {
                if (active) setSrtLoading(false);
            });

        return () => {
            active = false;
        };
    }, [status, jobId]);

    const showToast = (type: 'success' | 'error', message: string) => {
        clearToastTimer();
        setCopyToast({ type, message });
        toastTimerRef.current = setTimeout(() => {
            setCopyToast(null);
        }, 2500);
    };

    const copyToClipboard = async (text: string) => {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch {
                // Fall back to hidden textarea + execCommand
            }
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        let copied = false;
        try {
            copied = document.execCommand('copy');
        } finally {
            document.body.removeChild(textarea);
        }

        if (!copied) {
            throw new Error('Copy failed');
        }
    };

    const handleCopy = async (key: string, text: string) => {
        try {
            await copyToClipboard(text);
            setCopiedKeys((prev) => ({ ...prev, [key]: true }));
            showToast('success', 'ကူးယူပြီးပါပြီ');
        } catch {
            showToast('error', 'ကူးယူ၍ မရပါ။ ကျေးဇူးပြု၍ ကိုယ်တိုင် copy ကူးပါ။');
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes >= 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getSrtFilename = (originalName?: string | null) => {
        const name = originalName || videoFile?.name || uploadedSrtFilename || 'subtitles';
        const dotIdx = name.lastIndexOf('.');
        const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
        return `${base || 'subtitles'}.srt`;
    };

    const getTranslatedSrtFilename = () => {
        const name = videoFile?.name || uploadedSrtFilename || 'subtitles';
        const dotIdx = name.lastIndexOf('.');
        const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
        return `${base || 'subtitles'}_my.srt`;
    };

    const handleFileSelect = (file: File | null | undefined) => {
        if (!file) return;
        setVideoFile(file);
        setErrorMsg('');
    };

    const startPolling = (id: string) => {
        stopPolling();
        const interval = setInterval(async () => {
            try {
                const res = await axios.get(`/api/status/${id}`);
                const job = res.data;

                if (typeof job.progress === 'number') {
                    setProcessProgress(job.progress);
                }
                if (job.status) {
                    setStatusText(job.status);
                }
                if (job.currentStep) {
                    setCurrentStepText(job.currentStep);
                }

                if (job.status === 'complete') {
                    stopPolling();
                    setProcessProgress(100);
                    setLineCount(typeof job.result?.lineCount === 'number' ? job.result.lineCount : null);
                    setStatus('complete');
                } else if (job.status === 'error') {
                    stopPolling();
                    setStatus('error');
                    setErrorMsg(job.error || 'SRT ထုတ်ယူမှု မအောင်မြင်ပါ။');
                }
            } catch {
                // Ignore transient polling network errors and retry on next interval
            }
        }, 3000);
        pollTimerRef.current = interval;
    };

    const startExtraction = async () => {
        if (!videoFile) return;
        stopPolling();
        setStatus('uploading');
        setUploadProgress(0);
        setProcessProgress(0);
        setStatusText('ဗီဒီယို တင်နေသည်...');
        setCurrentStepText('Upload');
        setErrorMsg('');
        setLineCount(null);
        setJobId(null);
        setSrtRawText('');
        setSrtLoading(false);
        setSrtLoadError('');
        setCopiedKeys({});
        setInstructionMode('srt');
        setUploadedSrtFilename(null);
        setPastedTranslation('');
        setTranslatedMap({});
        try {
            localStorage.removeItem(TRANSLATED_PARTS_STORAGE_KEY);
        } catch {
            // Ignore localStorage errors
        }
        setConvertError(null);
        setConvertWarning(null);
        setLastDiagnostics(null);
        clearToastTimer();
        setCopyToast(null);
        if (srtFileInputRef.current) {
            srtFileInputRef.current.value = '';
        }

        const formData = new FormData();
        formData.append('video', videoFile);

        try {
            const res = await axios.post('/api/extract-srt', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const pct = Math.min(100, Math.round((progressEvent.loaded * 100) / progressEvent.total));
                        setUploadProgress(pct);
                    }
                }
            });

            const newJobId = res.data.jobId;
            setJobId(newJobId);
            setStatus('processing');
            setStatusText('စတင်နေသည်...');
            setCurrentStepText('Waiting in queue');
            startPolling(newJobId);
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err.response?.data?.error || err.message || 'ဗီဒီယို တင်ရာတွင် အမှားဖြစ်ပွားခဲ့သည်။');
        }
    };

    const retryExtraction = async () => {
        if (jobId) {
            try {
                setStatus('processing');
                setErrorMsg('');
                setStatusText('ပြန်လည်စတင်နေသည်...');
                await axios.post(`/api/retry/${jobId}`);
                startPolling(jobId);
                return;
            } catch {
                // Fall back to fresh upload if job retry is unavailable
            }
        }
        if (videoFile) {
            await startExtraction();
        } else {
            reset();
        }
    };

    const handleDownloadSrt = async () => {
        if (!jobId || isDownloading) return;
        setIsDownloading(true);
        try {
            const response = await axios.get(`/api/download-srt/${jobId}`, {
                responseType: 'blob'
            });
            const blob = new Blob([response.data], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', getSrtFilename());
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'SRT ဖိုင် ဒေါင်းလုဒ်လုပ်ရာတွင် အမှားဖြစ်ပွားခဲ့သည်။');
        } finally {
            setIsDownloading(false);
        }
    };

    const saveTranslatedParts = (sig: string, map: Record<number, string>) => {
        if (!sig) return;
        try {
            localStorage.setItem(TRANSLATED_PARTS_STORAGE_KEY, JSON.stringify({ sig, map }));
        } catch {
            // Ignore localStorage quota or restricted storage errors
        }
    };

    const clearTranslatedPartsStorage = () => {
        try {
            localStorage.removeItem(TRANSLATED_PARTS_STORAGE_KEY);
        } catch {
            // Ignore localStorage errors
        }
    };

    const handleOriginalSrtFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            setSrtRawText(text);
            setSrtLoadError('');
            setUploadedSrtFilename(file.name);
            setConvertError(null);
            setConvertWarning(null);
            setLastDiagnostics(null);
            setCopiedKeys((prev) => {
                const next = { ...prev };
                delete next['copy-missing'];
                delete next['converted-srt'];
                return next;
            });
        } catch {
            showToast('error', 'SRT ဖိုင် ဖတ်၍ မရပါ။');
        }
    };

    const handleAddPart = () => {
        if (srtBlocks.length === 0) {
            setConvertError('မူရင်း SRT ဖိုင် (.srt) ကို အရင်ရွေးချယ်ပေးပါ။');
            setConvertWarning(null);
            return;
        }

        const result = matchTranslationEntries(srtBlocks, pastedTranslation);
        setLastDiagnostics(result.diagnostics);

        if (result.matchedCount === 0) {
            setConvertError('ဒီစာထဲက နံပါတ်/အချိန်တွေ မူရင်း SRT နဲ့ မကိုက်ပါ');
            setConvertWarning(null);
            return;
        }

        const nextMap: Record<number, string> = {
            ...translatedMap,
            ...result.matchedMap
        };
        setTranslatedMap(nextMap);
        saveTranslatedParts(originalSig, nextMap);
        setPastedTranslation('');
        setConvertError(null);
        setConvertWarning(
            result.indexTimeWarning
                ? 'နံပါတ်တွေ မူရင်းနဲ့ မကိုက်နိုင်ပါ၊ အပိုင်းမှန်မမှန် စစ်ပါ'
                : null
        );
        setCopiedKeys((prev) => {
            const next = { ...prev };
            delete next['copy-missing'];
            delete next['converted-srt'];
            return next;
        });
    };

    const handleCopyMissingPart = async () => {
        if (missingBlocks.length === 0) return;
        const chunk = missingBlocks.slice(0, SRT_PART_SIZE);
        const content = chunk.map((b) => b.raw).join('\n\n');
        await handleCopy('copy-missing', content);
    };

    const handleClearParts = () => {
        if (!window.confirm('စုထားသမျှ ဘာသာပြန်စာများကို ဖျက်မှာ သေချာပါသလား?')) {
            return;
        }
        setTranslatedMap({});
        clearTranslatedPartsStorage();
        setConvertError(null);
        setConvertWarning(null);
        setLastDiagnostics(null);
        setCopiedKeys((prev) => {
            const next = { ...prev };
            delete next['copy-missing'];
            delete next['converted-srt'];
            return next;
        });
    };

    const handleDownloadConvertedSrt = () => {
        if (!convertedSrt) return;
        const blob = new Blob([convertedSrt], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', getTranslatedSrtFilename());
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleUseInMainTool = () => {
        if (!convertedSrt) return;
        try {
            localStorage.setItem(
                'superclick_pending_srt',
                JSON.stringify({
                    text: convertedSrt,
                    name: getTranslatedSrtFilename(),
                    lines: convertedCount,
                    ts: Date.now()
                })
            );
        } catch {
            // Ignore localStorage quota or restricted storage errors
        }
        onUseSrt?.();
    };

    const reset = () => {
        stopPolling();
        setVideoFile(null);
        setStatus('idle');
        setUploadProgress(0);
        setProcessProgress(0);
        setStatusText('');
        setCurrentStepText('');
        setJobId(null);
        setLineCount(null);
        setErrorMsg('');
        setIsDownloading(false);
        setSrtRawText('');
        setSrtLoading(false);
        setSrtLoadError('');
        setCopiedKeys({});
        setInstructionMode('srt');
        setUploadedSrtFilename(null);
        setPastedTranslation('');
        setTranslatedMap({});
        clearTranslatedPartsStorage();
        setConvertError(null);
        setConvertWarning(null);
        setLastDiagnostics(null);
        clearToastTimer();
        setCopyToast(null);
        if (videoInputRef.current) {
            videoInputRef.current.value = '';
        }
        if (srtFileInputRef.current) {
            srtFileInputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-6">
            <div className="mb-8 w-full max-w-full">
                <h2 className="text-2xl font-bold text-white mb-2">SRT ထုတ်ရန်</h2>
                <p className="text-gray-400 text-sm">
                    ဗီဒီယိုဖိုင်မှ မူရင်းစကားပြောသံကို Whisper ဖြင့် စာတန်းဖိုင် (.srt) အဖြစ် တိကျစွာ ထုတ်ယူပေးပါသည်။ ဗီဒီယိုအရှည် ကန့်သတ်ချက်မရှိဘဲ Credits အခမဲ့ အသုံးပြုနိုင်ပါသည်။
                </p>
            </div>

            {status === 'idle' && (
                <div className="max-w-2xl mx-auto">
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 space-y-6">
                        <div
                            onClick={() => videoInputRef.current?.click()}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                const dropped = e.dataTransfer.files?.[0];
                                if (dropped) handleFileSelect(dropped);
                            }}
                            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors bg-gray-950 flex flex-col items-center justify-center gap-4 group ${
                                isDragging
                                    ? 'border-indigo-500 bg-indigo-500/5'
                                    : videoFile
                                    ? 'border-indigo-500/60'
                                    : 'border-gray-700 hover:border-indigo-500'
                            }`}
                        >
                            <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                ref={videoInputRef}
                                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                            />
                            <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                {videoFile ? <Film className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
                            </div>
                            {videoFile ? (
                                <div className="space-y-1 max-w-full px-2">
                                    <p className="text-white font-bold text-base break-all">{videoFile.name}</p>
                                    <p className="text-gray-400 text-xs">{formatFileSize(videoFile.size)}</p>
                                    <p className="text-indigo-400 text-xs pt-1">အခြားဗီဒီယိုပြောင်းရန် နှိပ်ပါ</p>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-white font-bold text-lg mb-1">ဗီဒီယို ဖိုင် ရွေးချယ်ပါ</p>
                                    <p className="text-gray-500 text-sm">ဖိုင်ကို ဤနေရာသို့ ဆွဲထည့်ပါ သို့မဟုတ် နှိပ်၍ ရွေးပါ (MP4, MKV, MOV)</p>
                                </div>
                            )}
                        </div>

                        {videoFile && (
                            <div className="flex items-center justify-between gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-sm transition-colors inline-flex items-center gap-2"
                                >
                                    <X className="w-4 h-4" />
                                    ဖျက်မည်
                                </button>
                                <button
                                    type="button"
                                    onClick={startExtraction}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 px-8 rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-900/25 inline-flex items-center justify-center gap-2"
                                >
                                    <FileText className="w-4 h-4" />
                                    SRT ထုတ်မည်
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {(status === 'uploading' || status === 'processing') && (
                <div className="max-w-2xl mx-auto bg-gray-900 border border-gray-800 rounded-3xl p-10 text-center space-y-6">
                    <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin" style={{ animationDuration: '2s' }}></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-indigo-400 font-bold text-lg">
                                {status === 'uploading' ? `${uploadProgress}%` : `${Math.round(processProgress)}%`}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <h3 className="text-xl font-bold text-white">
                            {status === 'uploading' ? 'ဗီဒီယို တင်နေသည်...' : 'SRT ထုတ်ယူနေသည်...'}
                        </h3>
                        <p className="text-gray-400 text-sm">
                            {status === 'uploading'
                                ? `${videoFile?.name || ''} (${uploadProgress}%)`
                                : statusText || currentStepText || 'Whisper ဖြင့် စာတန်းခွဲထုတ်နေပါသည်...'}
                        </p>
                        {status === 'processing' && currentStepText && statusText && currentStepText !== statusText && (
                            <p className="text-gray-500 text-xs">{currentStepText}</p>
                        )}
                    </div>

                    <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                        <div
                            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${status === 'uploading' ? uploadProgress : processProgress}%` }}
                        ></div>
                    </div>

                    <p className="text-gray-500 text-xs">
                        ဗီဒီယို ရှည်လျားပါက စာတန်းထုတ်ယူချိန် အနည်းငယ် ကြာမြင့်နိုင်ပါသည်။ ကျေးဇူးပြု၍ ဤစာမျက်နှာကို မပိတ်ပါနှင့်။
                    </p>
                </div>
            )}

            {status === 'complete' && (
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 text-center space-y-6">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                            <CheckCircle className="w-8 h-8" />
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-2xl font-bold text-white">SRT ဖိုင် အသင့်ဖြစ်ပါပြီ!</h3>
                            <p className="text-gray-400 text-sm break-all">{getSrtFilename()}</p>
                            {lineCount !== null && (
                                <p className="text-xs text-emerald-400 font-semibold">
                                    စာတန်း စုစုပေါင်း {lineCount} ကြောင်း ထုတ်ယူပြီးပါပြီ
                                </p>
                            )}
                        </div>

                        {errorMsg && (
                            <p className="text-red-400 text-sm">{errorMsg}</p>
                        )}

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={handleDownloadSrt}
                                disabled={isDownloading}
                                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-8 py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-900/25 inline-flex items-center justify-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                {isDownloading ? 'ဒေါင်းလုဒ်ဆွဲနေသည်...' : 'SRT ဒေါင်းလုဒ်လုပ်မည်'}
                            </button>
                            <button
                                type="button"
                                onClick={reset}
                                className="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-colors inline-flex items-center justify-center gap-2"
                            >
                                <RotateCcw className="w-4 h-4" />
                                အသစ်ထပ်ထုတ်မည်
                            </button>
                        </div>
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-white">Gemini ဘာသာပြန်ရန် ကူးယူရန်</h4>
                                    {srtBlocks.length > 0 && (
                                        <p className="text-xs text-gray-400">စုစုပေါင်း {srtBlocks.length} ကြောင်း</p>
                                    )}
                                </div>
                            </div>

                            {copyToast && (
                                <div
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
                                        copyToast.type === 'success'
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                                    }`}
                                >
                                    {copyToast.type === 'success' ? (
                                        <Check className="w-3.5 h-3.5" />
                                    ) : (
                                        <AlertCircle className="w-3.5 h-3.5" />
                                    )}
                                    <span>{copyToast.message}</span>
                                </div>
                            )}
                        </div>

                        {srtLoading && (
                            <div className="flex items-center justify-center gap-2 py-6 text-gray-400 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                                <span>SRT စာသား ဖတ်နေသည်...</span>
                            </div>
                        )}

                        {!srtLoading && srtLoadError && (
                            <div className="bg-red-950/20 border border-red-900/40 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                                <p className="text-red-300 text-xs">{srtLoadError}</p>
                                {jobId && (
                                    <button
                                        type="button"
                                        onClick={() => fetchSrtText(jobId)}
                                        className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold transition-colors shrink-0"
                                    >
                                        ပြန်ဖတ်မည်
                                    </button>
                                )}
                            </div>
                        )}

                        {!srtLoading && !srtLoadError && srtBlocks.length > 0 && (
                            <div className="space-y-5">
                                <div className="space-y-2.5">
                                    <p className="text-xs font-bold text-gray-300">SRT ပုံစံ (နံပါတ်နှင့် အချိန်ပါ)</p>
                                    <div className="flex flex-wrap gap-2.5">
                                        {srtParts.map((part) => {
                                            const key = `srt-${part.partNumber}`;
                                            const isCopied = !!copiedKeys[key];
                                            const label =
                                                srtBlocks.length <= SRT_PART_SIZE
                                                    ? 'SRT အားလုံး ကူးယူမည်'
                                                    : `အပိုင်း ${part.partNumber} (${part.startNum}–${part.endNum}) ကူးယူမည်`;
                                            const content = part.blocks.map((b) => b.raw).join('\n\n');

                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    title={label}
                                                    onClick={() => handleCopy(key, content)}
                                                    className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all inline-flex items-center gap-1.5 ${
                                                        isCopied
                                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/25'
                                                            : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-lg shadow-orange-900/25'
                                                    }`}
                                                >
                                                    {isCopied ? (
                                                        <span>✓ ကူးပြီး</span>
                                                    ) : (
                                                        <>
                                                            <Copy className="w-3.5 h-3.5" />
                                                            <span>{label}</span>
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-2.5 pt-4 border-t border-gray-800">
                                    <p className="text-xs font-bold text-gray-300">စာသားသက်သက် (အချိန်မပါ)</p>
                                    <div className="flex flex-wrap gap-2.5">
                                        {srtParts.map((part) => {
                                            const key = `text-${part.partNumber}`;
                                            const isCopied = !!copiedKeys[key];
                                            const label =
                                                srtBlocks.length <= SRT_PART_SIZE
                                                    ? 'စာသားအားလုံး ကူးယူမည်'
                                                    : `အပိုင်း ${part.partNumber} (${part.startNum}–${part.endNum}) ကူးယူမည်`;
                                            const content = part.blocks
                                                .map((b) => `${b.number}. ${b.textOnly}`)
                                                .join('\n');

                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    title={label}
                                                    onClick={() => handleCopy(key, content)}
                                                    className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all inline-flex items-center gap-1.5 ${
                                                        isCopied
                                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/25'
                                                            : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-lg shadow-orange-900/25'
                                                    }`}
                                                >
                                                    {isCopied ? (
                                                        <span>✓ ကူးပြီး</span>
                                                    ) : (
                                                        <>
                                                            <Copy className="w-3.5 h-3.5" />
                                                            <span>{label}</span>
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 sm:p-5 space-y-3">
                            <div className="inline-flex p-1 bg-gray-900 border border-gray-800 rounded-xl gap-1">
                                <button
                                    type="button"
                                    onClick={() => setInstructionMode('srt')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        instructionMode === 'srt'
                                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    SRT အတွက်
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInstructionMode('text')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        instructionMode === 'text'
                                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    စာသားသက်သက်အတွက်
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h5 className="text-sm font-bold text-white">ဘာသာပြန်ညွှန်ကြားချက်</h5>
                                {instructionMode === 'srt' ? (
                                    <button
                                        type="button"
                                        onClick={() => handleCopy('instruction-srt', GEMINI_TRANSLATION_INSTRUCTION)}
                                        className={`px-4 py-2 rounded-xl font-bold text-xs transition-all inline-flex items-center gap-1.5 ${
                                            copiedKeys['instruction-srt']
                                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/25'
                                                : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-lg shadow-orange-900/25'
                                        }`}
                                    >
                                        {copiedKeys['instruction-srt'] ? (
                                            <span>✓ ကူးပြီး</span>
                                        ) : (
                                            <>
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>ညွှန်ကြားချက် ကူးယူမည်</span>
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleCopy('instruction-text', GEMINI_TEXT_ONLY_INSTRUCTION)}
                                        className={`px-4 py-2 rounded-xl font-bold text-xs transition-all inline-flex items-center gap-1.5 ${
                                            copiedKeys['instruction-text']
                                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/25'
                                                : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-lg shadow-orange-900/25'
                                        }`}
                                    >
                                        {copiedKeys['instruction-text'] ? (
                                            <span>✓ ကူးပြီး</span>
                                        ) : (
                                            <>
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>ညွှန်ကြားချက် ကူးယူမည်</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                            <textarea
                                readOnly
                                value={instructionMode === 'srt' ? GEMINI_TRANSLATION_INSTRUCTION : GEMINI_TEXT_ONLY_INSTRUCTION}
                                rows={7}
                                className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs text-gray-300 font-mono leading-relaxed resize-none focus:outline-none overflow-y-auto"
                            />
                        </div>
                    </div>
                </div>
            )}

            {(status === 'idle' || status === 'complete') && (
                <div className="max-w-2xl mx-auto">
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
                                    <ArrowRightLeft className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-white">ဘာသာပြန်စာ ပြန်ထည့်ရန်</h4>
                                    <p className="text-xs text-gray-400">
                                        Gemini ဘာသာပြန်ထားတဲ့ စာသားကို အပိုင်းလိုက်ထည့်ပြီး မူရင်းအချိန်များဖြင့် SRT ဖိုင်အဖြစ် ပြန်ပြောင်းပေးပါသည်
                                    </p>
                                </div>
                            </div>

                            {status === 'idle' && copyToast && (
                                <div
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
                                        copyToast.type === 'success'
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                                    }`}
                                >
                                    {copyToast.type === 'success' ? (
                                        <Check className="w-3.5 h-3.5" />
                                    ) : (
                                        <AlertCircle className="w-3.5 h-3.5" />
                                    )}
                                    <span>{copyToast.message}</span>
                                </div>
                            )}
                        </div>

                        {srtBlocks.length === 0 && (
                            <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-2.5">
                                <label className="block text-xs font-bold text-gray-300">
                                    မူရင်း SRT ဖိုင် ရွေးပါ (.srt)
                                </label>
                                <input
                                    ref={srtFileInputRef}
                                    type="file"
                                    accept=".srt,text/plain"
                                    onChange={handleOriginalSrtFilePick}
                                    className="block w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-orange-500/15 file:text-orange-400 hover:file:bg-orange-500/25 cursor-pointer"
                                />
                            </div>
                        )}

                        {srtBlocks.length > 0 && (
                            <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <span className="font-bold text-white">
                                        {doneCount}/{srtBlocks.length} ပြည့်စုံပြီး
                                    </span>
                                    <span className="text-gray-400">
                                        မူရင်း SRT{uploadedSrtFilename ? ` (${uploadedSrtFilename})` : ''}: စုစုပေါင်း {srtBlocks.length} ကြောင်း
                                    </span>
                                </div>
                                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                                    <div
                                        className={`h-2 rounded-full transition-all duration-300 ${
                                            isAllTranslated
                                                ? 'bg-emerald-500'
                                                : 'bg-gradient-to-r from-orange-500 to-amber-500'
                                        }`}
                                        style={{
                                            width: `${Math.min(100, Math.round((doneCount / srtBlocks.length) * 100))}%`
                                        }}
                                    />
                                </div>
                                {missingRangesText && (
                                    <p className="text-xs text-amber-300/90 break-words leading-relaxed">
                                        ကျန်သေးသည်: {missingRangesText}
                                    </p>
                                )}
                            </div>
                        )}

                        <textarea
                            value={pastedTranslation}
                            onChange={(e) => {
                                setPastedTranslation(e.target.value);
                                if (convertError) setConvertError(null);
                                if (convertWarning) setConvertWarning(null);
                            }}
                            rows={8}
                            placeholder="Gemini ဘာသာပြန်ထားတဲ့ စာကို ဒီမှာ paste လုပ်ပါ"
                            className="w-full bg-gray-950 border border-gray-800 focus:border-orange-500 focus:outline-none rounded-2xl p-4 text-xs sm:text-sm text-gray-200 placeholder-gray-500 leading-relaxed resize-y"
                        />

                        {lastDiagnostics && (
                            <p className="text-xs text-gray-400 leading-relaxed">
                                ဖတ်ရသည်: {lastDiagnostics.parsed} · နံပါတ်နဲ့ကိုက်: {lastDiagnostics.byIndex} · အချိန်နဲ့ကိုက်: {lastDiagnostics.byTime} · အစဉ်နဲ့ကိုက်: {lastDiagnostics.byOrder} · မကိုက်: {lastDiagnostics.unmatched} · ထပ်နေသည်: {lastDiagnostics.dups}
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={handleAddPart}
                                className="px-6 py-3 rounded-xl font-bold text-sm transition-all bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-lg shadow-orange-900/25 inline-flex items-center gap-2"
                            >
                                <FileText className="w-4 h-4" />
                                <span>ဒီအပိုင်း ထည့်မည်</span>
                            </button>

                            {srtBlocks.length > 0 && missingBlocks.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleCopyMissingPart}
                                    className={`px-4 py-3 rounded-xl font-bold text-xs transition-all inline-flex items-center gap-1.5 ${
                                        copiedKeys['copy-missing']
                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/25'
                                            : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                                    }`}
                                >
                                    {copiedKeys['copy-missing'] ? (
                                        <span>✓ ကူးပြီး</span>
                                    ) : (
                                        <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>ကျန်သေးသော အပိုင်း ကူးယူမည်</span>
                                        </>
                                    )}
                                </button>
                            )}

                            {doneCount > 0 && (
                                <button
                                    type="button"
                                    onClick={handleClearParts}
                                    className="px-4 py-3 rounded-xl font-bold text-xs transition-colors bg-gray-800 hover:bg-red-950/60 text-red-300 border border-gray-700 hover:border-red-500/40 inline-flex items-center gap-1.5"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>စုထားသမျှ ဖျက်မည်</span>
                                </button>
                            )}
                        </div>

                        {convertError && (
                            <div className="bg-red-950/25 border border-red-500/30 rounded-2xl p-4 text-sm text-red-300">
                                <div className="flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <p className="font-bold text-red-400">{convertError}</p>
                                </div>
                            </div>
                        )}

                        {convertWarning && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-300 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <span>{convertWarning}</span>
                            </div>
                        )}

                        {convertedSrt && (
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 space-y-4">
                                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                                    <CheckCircle className="w-4 h-4 shrink-0" />
                                    <span>SRT အသင့်ဖြစ်ပါပြီ ({convertedCount} ကြောင်း)</span>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={handleUseInMainTool}
                                        className="px-5 py-2.5 rounded-xl font-bold text-xs transition-all bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-lg shadow-orange-900/25 inline-flex items-center gap-1.5"
                                    >
                                        <span>ပင်မ Tool မှာ သုံးမည် →</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDownloadConvertedSrt}
                                        className="px-5 py-2.5 rounded-xl font-bold text-xs transition-all bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 inline-flex items-center gap-1.5"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>ဘာသာပြန် SRT ဒေါင်းလုဒ်လုပ်မည်</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy('converted-srt', convertedSrt)}
                                        className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all inline-flex items-center gap-1.5 ${
                                            copiedKeys['converted-srt']
                                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/25'
                                                : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                                        }`}
                                    >
                                        {copiedKeys['converted-srt'] ? (
                                            <span>✓ ကူးပြီး</span>
                                        ) : (
                                            <>
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>ဘာသာပြန် SRT ကူးယူမည်</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {convertedPreviewBlocks.length > 0 && (
                                    <div className="pt-3 border-t border-emerald-500/20 space-y-2">
                                        <p className="text-[11px] font-bold text-emerald-300/90">
                                            အစမ်းကြည့်ရှုရန် (ပထမ ၃ ကြောင်း)
                                        </p>
                                        <div className="space-y-2">
                                            {convertedPreviewBlocks.map((block) => (
                                                <div
                                                    key={block.number}
                                                    className="bg-gray-950/70 border border-gray-800/80 rounded-xl px-3.5 py-2.5 text-xs space-y-0.5"
                                                >
                                                    <div className="flex items-center gap-2 text-[11px] font-mono text-gray-400">
                                                        <span className="font-bold text-emerald-400">#{block.number}</span>
                                                        {block.timestampLine && <span>{block.timestampLine}</span>}
                                                    </div>
                                                    <p className="text-gray-200 leading-relaxed break-words">{block.textOnly}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {status === 'error' && (
                <div className="max-w-2xl mx-auto bg-red-950/20 border border-red-900/50 rounded-3xl p-8 text-center space-y-6">
                    <AlertCircle className="w-14 h-14 text-red-500 mx-auto" />
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-red-400">SRT ထုတ်ယူမှု မအောင်မြင်ပါ</h3>
                        <p className="text-red-300 text-sm break-words">{errorMsg || 'မမျှော်လင့်ထားသော အမှားတစ်ခု ဖြစ်ပွားခဲ့သည်။'}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={retryExtraction}
                            className="w-full sm:w-auto bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-xl text-sm transition-all inline-flex items-center justify-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" />
                            ပြန်ကြိုးစားမည်
                        </button>
                        <button
                            type="button"
                            onClick={reset}
                            className="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold py-3 px-6 rounded-xl text-sm transition-colors"
                        >
                            ဖိုင်အသစ်ရွေးမည်
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
