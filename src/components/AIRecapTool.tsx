import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Play, AlertCircle } from 'lucide-react';
import axios from 'axios';

export const AIRecapTool: React.FC = () => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'complete' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [result, setResult] = useState<any>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const [pollTimer, setPollTimer] = useState<any>(null);

    useEffect(() => {
        return () => {
            if (pollTimer) clearInterval(pollTimer);
        };
    }, [pollTimer]);

    const startAnalysis = async () => {
        if (!videoFile) return;
        
        setStatus('uploading');
        setErrorMsg('');
        setResult(null);

        const formData = new FormData();
        formData.append('video', videoFile);

        try {
            const response = await axios.post('/api/ai-recap/analyze', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const newJobId = response.data.jobId;
            setStatus('analyzing');
            startPolling(newJobId);
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err.response?.data?.error || err.message || 'Upload failed');
        }
    };

    const startPolling = (id: string) => {
        if (pollTimer) clearInterval(pollTimer);

        const interval = setInterval(async () => {
            try {
                const statusRes = await axios.get(`/api/ai-recap/status/${id}`);
                const job = statusRes.data;
                
                if (job.status === 'done') {
                    clearInterval(interval);
                    try {
                        setResult(JSON.parse(job.resultJson));
                    } catch (e) {
                        setResult(job.resultJson);
                    }
                    setStatus('complete');
                } else if (job.status === 'error') {
                    clearInterval(interval);
                    setStatus('error');
                    setErrorMsg(job.error || 'Processing failed');
                }
            } catch (e) {
                // Ignore temporary network errors
            }
        }, 3000);

        setPollTimer(interval);
    };

    const reset = () => {
        if (pollTimer) clearInterval(pollTimer);
        setVideoFile(null);
        setStatus('idle');
        setResult(null);
        setErrorMsg('');
    };

    return (
        <div className="space-y-6">
            <div className="mb-8 w-full max-w-full">
                <h2 className="text-2xl font-bold text-white mb-2">AI Movie Recap (Beta)</h2>
                <p className="text-gray-400">
                    Upload a movie or drama to extract key plot scenes and generate a Burmese narration script automatically using Gemini.
                </p>
            </div>

            {status === 'idle' && (
                <div className="max-w-2xl mx-auto space-y-8">
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 space-y-6">
                        <div 
                            onClick={() => videoInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-2xl p-12 text-center cursor-pointer transition-colors bg-gray-950 flex flex-col items-center justify-center gap-4 group"
                        >
                            <input 
                                type="file" 
                                accept="video/*" 
                                className="hidden" 
                                ref={videoInputRef}
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        setVideoFile(e.target.files[0]);
                                    }
                                }}
                            />
                            <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                <UploadCloud className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-white font-bold text-lg mb-1">
                                    {videoFile ? videoFile.name : 'ဗီဒီယို ဖိုင် ရွေးချယ်ပါ'}
                                </p>
                                <p className="text-gray-500 text-sm">MP4, MKV, MOV up to 100MB (limit for testing)</p>
                            </div>
                        </div>

                        {videoFile && (
                            <button
                                onClick={startAnalysis}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Play className="w-5 h-5" />
                                စတင် ပိုင်းခြားစိတ်ဖြာမည်
                            </button>
                        )}
                    </div>
                </div>
            )}

            {(status === 'uploading' || status === 'analyzing') && (
                <div className="max-w-2xl mx-auto bg-gray-900 border border-gray-800 rounded-3xl p-12 text-center space-y-6">
                    <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-indigo-400 font-bold text-sm">
                                {status === 'uploading' ? 'UP' : 'AI'}
                            </span>
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2">
                            {status === 'uploading' ? 'ဗီဒီယို တင်နေပါသည်...' : 'AI ပိုင်းခြားစိတ်ဖြာနေပါသည်...'}
                        </h3>
                        <p className="text-gray-400">
                            {status === 'analyzing' ? 'Gemini သည် ဇာတ်ကွက်ကို နားလည်ရန် ဗီဒီယိုကို ကြည့်ရှုနေပါသည်။' : 'ခဏစောင့်ပါ။'}
                        </p>
                    </div>
                </div>
            )}

            {status === 'error' && (
                <div className="max-w-2xl mx-auto bg-red-950/20 border border-red-900/50 rounded-3xl p-8 text-center space-y-6">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
                    <h3 className="text-xl font-bold text-red-400">Processing Error</h3>
                    <p className="text-red-300">{errorMsg}</p>
                    <button
                        onClick={reset}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-xl transition-all"
                    >
                        နောက်တစ်ကြိမ် ပြန်ကြိုးစားမည်
                    </button>
                </div>
            )}

            {status === 'complete' && result && (
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white">Analysis Complete</h3>
                        <button
                            onClick={reset}
                            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
                        >
                            Start New
                        </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4">
                            <h4 className="text-lg font-bold text-indigo-400 border-b border-gray-800 pb-2">Selected Scenes</h4>
                            <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                                {result.scenes && Array.isArray(result.scenes) ? result.scenes.map((scene: any, i: number) => (
                                    <div key={i} className="bg-gray-950 border border-gray-800 p-3 rounded-xl">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-indigo-500/20 text-indigo-400 text-xs font-bold px-2 py-0.5 rounded">
                                                {scene.start}s - {scene.end}s
                                            </span>
                                            <span className="text-gray-500 text-xs font-mono">
                                                {(scene.end - scene.start).toFixed(1)}s
                                            </span>
                                        </div>
                                        <p className="text-gray-400 text-xs mb-2">{scene.reason}</p>
                                        <p className="text-indigo-200 text-sm italic border-l-2 border-indigo-500/50 pl-3">"{scene.narration_text}"</p>
                                    </div>
                                )) : (
                                    <p className="text-gray-500">No scenes found in the expected format.</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 flex flex-col">
                            <h4 className="text-lg font-bold text-indigo-400 border-b border-gray-800 pb-2 mb-4">Full Script Preview</h4>
                            <div className="flex-1 bg-gray-950 border border-gray-800 rounded-xl p-4 overflow-y-auto custom-scrollbar whitespace-pre-wrap text-gray-300 text-sm leading-relaxed max-h-[500px]">
                                {result.scenes && Array.isArray(result.scenes)
                                    ? result.scenes.map((s: any) => s.narration_text).join(' ')
                                    : "No narration found in the expected format."}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
