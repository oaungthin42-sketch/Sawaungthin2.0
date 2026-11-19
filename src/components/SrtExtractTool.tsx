import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, Download, AlertCircle, CheckCircle, RotateCcw, Film, X } from 'lucide-react';
import axios from 'axios';

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

    const videoInputRef = useRef<HTMLInputElement>(null);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = () => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    };

    useEffect(() => {
        return () => stopPolling();
    }, []);

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
                <div className="max-w-2xl mx-auto bg-gray-900 border border-gray-800 rounded-3xl p-8 text-center space-y-6">
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
