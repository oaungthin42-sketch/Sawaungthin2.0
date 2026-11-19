import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UploadCloud, FileText, Download, AlertCircle, CheckCircle, RotateCcw, Film, X, Copy, Check, Loader2, Sparkles } from 'lucide-react';
import axios from 'axios';

const GEMINI_TRANSLATION_INSTRUCTION = `Translate the subtitle text of the SRT below into natural spoken Burmese for TTS narration.
- Keep every subtitle number and every timestamp line EXACTLY unchanged. Same number of blocks. Never merge, split, skip or reorder blocks.
- Output valid SRT only. No notes or explanations.
- Use spoken endings (တယ်, ပါတယ်, ခဲ့တယ်, ဘူး). Never written endings (သည်, ပါသည်, ခဲ့သည်).
- Short, natural, varied sentences. Do not translate word by word. Do not repeat the same ending in consecutive lines.
- Faithful meaning only. Do not add, remove or summarize. Keep each line about as long as the original.
- Keep each person's gender and pronoun consistent across the whole file. Transliterate names the same way every time.
- Burmese script only: no English letters, and no digits. Write all numbers in Burmese words.`;

const SRT_PART_SIZE = 200;

interface SrtBlock {
    raw: string;
    number: number;
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
            textOnly
        };
    });
};

export const SrtExtractTool: React.FC = () => {
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

    const videoInputRef = useRef<HTMLInputElement>(null);
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
        const name = originalName || videoFile?.name || 'subtitles';
        const dotIdx = name.lastIndexOf('.');
        const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
        return `${base || 'subtitles'}.srt`;
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
        clearToastTimer();
        setCopyToast(null);

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
        clearToastTimer();
        setCopyToast(null);
        if (videoInputRef.current) {
            videoInputRef.current.value = '';
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
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h5 className="text-sm font-bold text-white">ဘာသာပြန်ညွှန်ကြားချက်</h5>
                                <button
                                    type="button"
                                    onClick={() => handleCopy('instruction', GEMINI_TRANSLATION_INSTRUCTION)}
                                    className={`px-4 py-2 rounded-xl font-bold text-xs transition-all inline-flex items-center gap-1.5 ${
                                        copiedKeys['instruction']
                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/25'
                                            : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-lg shadow-orange-900/25'
                                    }`}
                                >
                                    {copiedKeys['instruction'] ? (
                                        <span>✓ ကူးပြီး</span>
                                    ) : (
                                        <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>ညွှန်ကြားချက် ကူးယူမည်</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <textarea
                                readOnly
                                value={GEMINI_TRANSLATION_INSTRUCTION}
                                rows={7}
                                className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs text-gray-300 font-mono leading-relaxed resize-none focus:outline-none overflow-y-auto"
                            />
                        </div>
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
