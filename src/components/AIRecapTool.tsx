import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Play, AlertCircle, ArrowRight, Check } from 'lucide-react';
import axios from 'axios';

const RecapVideoSeekBar = ({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateProgress = () => { if (video.duration) setProgress((video.currentTime / video.duration) * 100); };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('timeupdate', updateProgress);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoRef]);
  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (video) { if (video.paused) video.play(); else video.pause(); }
  };
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (video && video.duration) {
      video.currentTime = (Number(e.target.value) / 100) * video.duration;
      setProgress(Number(e.target.value));
    }
  };
  return (
    <div className="w-full mt-3 flex items-center gap-3 bg-gray-900/60 p-2 rounded-xl border border-gray-800">
      <button onClick={togglePlay} className="text-white hover:text-indigo-400 focus:outline-none transition-colors">
        {isPlaying ? <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <Play size={20} className="fill-current" />}
      </button>
      <input type="range" min="0" max="100" step="0.1" value={progress || 0} onChange={handleSeek} className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
    </div>
  );
};

export const AIRecapTool: React.FC = () => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'complete' | 'error' | 'generating_video' | 'video_done' | 'video_error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [result, setResult] = useState<any>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const [pollTimer, setPollTimer] = useState<any>(null);
    const [voices, setVoices] = useState<any[]>([]);
    const [voiceId, setVoiceId] = useState<string>('');
    const [useVoiceClone, setUseVoiceClone] = useState<number>(0);
    const [refVoices, setRefVoices] = useState<any[]>([]);
    const [referenceVoiceId, setReferenceVoiceId] = useState<string>('');
    const [burnSubtitles, setBurnSubtitles] = useState<boolean>(false);
    const [subtitleColor, setSubtitleColor] = useState<string>('white');
    const [blurBoxes, setBlurBoxes] = useState<any[]>([]);
    const [subtitlePosition, setSubtitlePosition] = useState<any>({ xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 });
    const [watermarkText, setWatermarkText] = useState<string>('');
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [isFlipped, setIsFlipped] = useState<boolean>(false);
    
    const steps = ["ဗီဒီယို", "Blur & Watermark", "စာတန်း", "အသံ & စတင်မည်"];

    useEffect(() => {
        if (videoFile) {
            const url = URL.createObjectURL(videoFile);
            setVideoPreviewUrl(url);
            return () => { URL.revokeObjectURL(url); };
        } else {
            setVideoPreviewUrl(null);
        }
    }, [videoFile]);
    
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const videoRectRef = useRef<any>({ left: 0, top: 0, width: 0, height: 0 });
    const [videoRect, setVideoRect] = useState<any>({ left: 0, top: 0, width: 0, height: 0 });
    const [selectedElement, setSelectedElement] = useState<string | null>(null);
    const videoPreviewRef = useRef<HTMLVideoElement>(null);

    const updateVideoRect = () => {
        if (!previewContainerRef.current || !videoPreviewRef.current) return;
        const container = previewContainerRef.current.getBoundingClientRect();
        const videoW = videoPreviewRef.current.videoWidth;
        const videoH = videoPreviewRef.current.videoHeight;
        if (!videoW || !videoH) return;
        const containerRatio = container.width / container.height;
        const videoRatio = videoW / videoH;
        let displayWidth, displayHeight;
        if (videoRatio > containerRatio) {
            displayWidth = container.width;
            displayHeight = container.width / videoRatio;
        } else {
            displayHeight = container.height;
            displayWidth = container.height * videoRatio;
        }
        const rect = {
            left: (container.width - displayWidth) / 2,
            top: (container.height - displayHeight) / 2,
            width: displayWidth,
            height: displayHeight
        };
        videoRectRef.current = rect;
        setVideoRect(rect);
    };

    useEffect(() => {
        window.addEventListener('resize', updateVideoRect);
        return () => window.removeEventListener('resize', updateVideoRect);
    }, []);

    useEffect(() => {
        if (currentStep >= 1 && currentStep <= 3) {
            setTimeout(updateVideoRect, 50);
        }
    }, [currentStep, isFlipped]);

    const handlePointerDown = (e: React.PointerEvent, boxId: string, action: 'move' | 'tl' | 'tr' | 'bl' | 'br') => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target instanceof HTMLElement) {
            e.target.setPointerCapture(e.pointerId);
        }
        setSelectedElement(boxId);
        if (!previewContainerRef.current) return;
        const rect = previewContainerRef.current.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        
        let isDragging = true;
        let latestDx = 0;
        let latestDy = 0;
        let rafId: number | null = null;
        
        const applyMovement = (current: any, startXPct: number, startYPct: number, startWPct: number, startHPct: number, dxPct: number, dyPct: number) => {
            if (action === 'move') {
                return {
                    ...current,
                    xPct: Math.max(0, Math.min(100 - current.widthPct, startXPct + dxPct)),
                    yPct: Math.max(0, Math.min(100 - current.heightPct, startYPct + dyPct))
                };
            } else if (action === 'tl') {
                const newW = startWPct - dxPct;
                const newH = startHPct - dyPct;
                const canW = newW >= 5 && startXPct + dxPct >= 0;
                const canH = newH >= 5 && startYPct + dyPct >= 0;
                return {
                    ...current,
                    xPct: canW ? startXPct + dxPct : current.xPct,
                    yPct: canH ? startYPct + dyPct : current.yPct,
                    widthPct: canW ? newW : current.widthPct,
                    heightPct: canH ? newH : current.heightPct
                };
            } else if (action === 'tr') {
                const newW = startWPct + dxPct;
                const newH = startHPct - dyPct;
                const canW = newW >= 5 && startXPct + newW <= 100;
                const canH = newH >= 5 && startYPct + dyPct >= 0;
                return {
                    ...current,
                    yPct: canH ? startYPct + dyPct : current.yPct,
                    widthPct: canW ? newW : current.widthPct,
                    heightPct: canH ? newH : current.heightPct
                };
            } else if (action === 'bl') {
                const newW = startWPct - dxPct;
                const newH = startHPct + dyPct;
                const canW = newW >= 5 && startXPct + dxPct >= 0;
                const canH = newH >= 5 && startYPct + newH <= 100;
                return {
                    ...current,
                    xPct: canW ? startXPct + dxPct : current.xPct,
                    widthPct: canW ? newW : current.widthPct,
                    heightPct: canH ? newH : current.heightPct
                };
            } else if (action === 'br') {
                const newW = startWPct + dxPct;
                const newH = startHPct + dyPct;
                const canW = newW >= 5 && startXPct + newW <= 100;
                const canH = newH >= 5 && startYPct + newH <= 100;
                return {
                    ...current,
                    widthPct: canW ? newW : current.widthPct,
                    heightPct: canH ? newH : current.heightPct
                };
            }
            return current;
        };

        if (boxId === 'subtitle') {
            setSubtitlePosition((prev: any) => {
                const startXPct = prev.xPct;
                const startYPct = prev.yPct;
                const startWPct = prev.widthPct;
                const startHPct = prev.heightPct;
                const onPointerMove = (moveEv: PointerEvent) => {
                    if (moveEv.cancelable) moveEv.preventDefault();
                    latestDx = moveEv.clientX - startX;
                    latestDy = moveEv.clientY - startY;
                    if (!rafId) {
                        rafId = requestAnimationFrame(() => {
                            rafId = null;
                            if (!isDragging) return;
                            const dxPct = (latestDx / (videoRectRef.current.width || rect.width)) * 100;
                            const dyPct = (latestDy / (videoRectRef.current.height || rect.height)) * 100;
                            setSubtitlePosition((current: any) => applyMovement(current, startXPct, startYPct, startWPct, startHPct, dxPct, dyPct));
                        });
                    }
                };
                const onPointerUp = () => {
                    isDragging = false;
                    if (rafId) cancelAnimationFrame(rafId);
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                };
                window.addEventListener('pointermove', onPointerMove, { passive: false });
                window.addEventListener('pointerup', onPointerUp);
                return prev;
            });
            return;
        }

        setBlurBoxes(prev => {
            const box = prev.find(b => b.id === boxId);
            if (!box) return prev;
            const startXPct = box.xPct;
            const startYPct = box.yPct;
            const startWPct = box.widthPct;
            const startHPct = box.heightPct;
            const onPointerMove = (moveEv: PointerEvent) => {
                if (moveEv.cancelable) moveEv.preventDefault();
                latestDx = moveEv.clientX - startX;
                latestDy = moveEv.clientY - startY;
                if (!rafId) {
                    rafId = requestAnimationFrame(() => {
                        rafId = null;
                        if (!isDragging) return;
                        const dxPct = (latestDx / (videoRectRef.current.width || rect.width)) * 100;
                        const dyPct = (latestDy / (videoRectRef.current.height || rect.height)) * 100;
                        setBlurBoxes(current => current.map(b => {
                            if (b.id !== boxId) return b;
                            return applyMovement(b, startXPct, startYPct, startWPct, startHPct, dxPct, dyPct);
                        }));
                    });
                }
            };
            const onPointerUp = () => {
                isDragging = false;
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            };
            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
            return prev;
        });
    };

    useEffect(() => {
        const fetchVoices = async () => {
            try {
                const res = await axios.get('/api/voices');
                setVoices(res.data);
                if (res.data.length > 0) {
                    setVoiceId(res.data[0].id);
                }
            } catch (e) {}
        };
        fetchVoices();
    }, []);

    useEffect(() => {
        if (useVoiceClone === 1) {
            const fetchRefVoices = async () => {
                try {
                    const res = await axios.get('/api/voice-clones/reference-voices');
                    setRefVoices(res.data);
                    if (res.data.length > 0) {
                        setReferenceVoiceId(res.data[0].id);
                    }
                } catch (e) {}
            };
            fetchRefVoices();
        }
    }, [useVoiceClone]);

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
            setJobId(newJobId);
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

    
    const generateVideo = async () => {
        if (!jobId) return;
        setStatus('generating_video');
        setErrorMsg('');
        try {
            await axios.post(`/api/ai-recap/generate/${jobId}`, {
                voiceId,
                useVoiceClone,
                referenceVoiceId,
                burnSubtitles,
                subtitleColor,
                blurBoxes: JSON.stringify(blurBoxes),
                subtitlePosition: JSON.stringify(subtitlePosition),
                watermarkText,
                flipped: isFlipped ? '1' : '0'
            });
            startGenerationPolling(jobId);
        } catch (err: any) {
            setStatus('video_error');
            setErrorMsg(err.response?.data?.error || err.message || 'Generation failed');
        }
    };

    const startGenerationPolling = (id: string) => {
        if (pollTimer) clearInterval(pollTimer);
        const interval = setInterval(async () => {
            try {
                const statusRes = await axios.get(`/api/ai-recap/status/${id}`);
                const job = statusRes.data;
                
                if (job.generationStatus === 'video_done') {
                    clearInterval(interval);
                    setStatus('video_done');
                } else if (job.generationStatus === 'video_error') {
                    clearInterval(interval);
                    setStatus('video_error');
                    setErrorMsg(job.error || 'Video generation failed');
                }
            } catch (e) {
                // Ignore temp network errors
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
        setJobId(null);
        setCurrentStep(1);
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
                    <div className="flex items-center justify-between mb-8 relative">
                        <div className="absolute left-0 top-1/2 w-full h-1 bg-gray-800 -z-10" />
                        <div className="absolute left-0 top-1/2 h-1 bg-indigo-500 -z-10 transition-all duration-300" style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }} />
                        {steps.map((step, idx) => {
                            const stepNum = idx + 1;
                            const isActive = currentStep === stepNum;
                            const isPast = currentStep > stepNum;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentStep(stepNum)}
                                    className="flex flex-col items-center gap-2 group"
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                                        isActive ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] ring-4 ring-gray-950' :
                                        isPast ? 'bg-indigo-500 text-white ring-4 ring-gray-950' :
                                        'bg-gray-800 text-gray-400 group-hover:bg-gray-700 ring-4 ring-gray-950'
                                    }`}>
                                        {isPast ? <Check className="w-5 h-5" /> : stepNum}
                                    </div>
                                    <span className={`text-xs font-bold absolute -bottom-6 whitespace-nowrap transition-colors ${
                                        isActive ? 'text-indigo-400' : isPast ? 'text-gray-300' : 'text-gray-600'
                                    }`}>
                                        {step}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 space-y-8 mt-12 relative overflow-hidden min-h-[400px] flex flex-col">
                        
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <label className="text-white font-bold text-sm">Preview</label>
                                    <div className="flex items-center gap-3 bg-gray-950 px-4 py-2 rounded-xl border border-gray-800">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">ဗီဒီယို လှည့်ရန်</span>
                                        <button onClick={() => setIsFlipped(!isFlipped)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isFlipped ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                            <ArrowRight size={14} className={`transition-transform duration-300 ${isFlipped ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>
                                </div>
                                <div 
                                    ref={previewContainerRef}
                                    className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800/80 select-none touch-none max-w-2xl mx-auto"
                                    style={{ aspectRatio: '16/9' }}
                                    onClick={() => setSelectedElement(null)}
                                >
                                    <video 
                                        ref={videoPreviewRef}
                                        src={videoPreviewUrl || undefined}
                                        className="w-full h-full object-contain pointer-events-none"
                                        style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }}
                                        muted playsInline
                                        onLoadedMetadata={updateVideoRect}
                                    />
                                </div>
                                <div className="max-w-2xl mx-auto">
                                    <RecapVideoSeekBar videoRef={videoPreviewRef} />
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 max-w-2xl mx-auto w-full">
                                <div className="flex justify-between items-center mb-4">
                                    <label className="text-white font-bold text-sm">Blur Boxes</label>
                                    <button 
                                        onClick={() => {
                                            if (blurBoxes.length >= 3) return;
                                            setBlurBoxes([...blurBoxes, { id: 'box_' + Date.now(), xPct: 25, yPct: 15, widthPct: 50, heightPct: 15, strength: 15 }]);
                                            setSelectedElement('box_' + Date.now());
                                        }} 
                                        disabled={blurBoxes.length >= 3} 
                                        className="text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-indigo-400 px-3 py-1.5 rounded-lg font-bold transition-colors"
                                    >
                                        Add blur box
                                    </button>
                                </div>

                                <div 
                                    ref={previewContainerRef}
                                    className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800/80 select-none touch-none"
                                    style={{ aspectRatio: '16/9' }}
                                    onClick={() => setSelectedElement(null)}
                                >
                                    <video 
                                        ref={videoPreviewRef}
                                        src={videoPreviewUrl || undefined}
                                        className="w-full h-full object-contain pointer-events-none opacity-50"
                                        style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }}
                                        muted playsInline
                                        onLoadedMetadata={updateVideoRect}
                                    />
                                    
                                    {blurBoxes.map((box, index) => (
                                        <div
                                            key={box.id}
                                            onPointerDown={(e) => handlePointerDown(e, box.id, 'move')}
                                            onClick={(e) => { e.stopPropagation(); setSelectedElement(box.id); }}
                                            className={`absolute border-2 cursor-move flex items-center justify-center group ${selectedElement === box.id ? 'border-amber-500 bg-amber-500/10 z-20' : 'border-amber-600/60 border-dashed bg-amber-500/5 z-10'}`}
                                            style={{
                                                left: `${videoRect.left + (box.xPct / 100) * videoRect.width}px`,
                                                top: `${videoRect.top + (box.yPct / 100) * videoRect.height}px`,
                                                width: `${(box.widthPct / 100) * videoRect.width}px`,
                                                height: `${(box.heightPct / 100) * videoRect.height}px`,
                                            }}
                                        >
                                            <div className="absolute top-1 left-1 bg-amber-500/80 text-black text-[10px] px-1 rounded backdrop-blur-sm pointer-events-none">Blur #{index + 1}</div>
                                            {selectedElement === box.id && (
                                                <>
                                                    <div className="absolute -top-2 -left-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize shadow-md border-2 border-amber-500" onPointerDown={(e) => handlePointerDown(e, box.id, 'tl')} />
                                                    <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize shadow-md border-2 border-amber-500" onPointerDown={(e) => handlePointerDown(e, box.id, 'br')} />
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                
                                {selectedElement && selectedElement.startsWith('box_') && (
                                    <div className="mt-4 p-4 bg-gray-950 rounded-xl border border-gray-800 flex items-center justify-between">
                                        <div className="flex-1 max-w-xs space-y-2">
                                            <div className="flex justify-between text-xs text-gray-400 font-bold">
                                                <span>Blur Strength</span>
                                                <span>{blurBoxes.find(b => b.id === selectedElement)?.strength || 15}</span>
                                            </div>
                                            <input 
                                                type="range" min="1" max="30" 
                                                value={blurBoxes.find(b => b.id === selectedElement)?.strength || 15}
                                                onChange={(e) => setBlurBoxes(blurBoxes.map(b => b.id === selectedElement ? { ...b, strength: parseInt(e.target.value) } : b))}
                                                className="w-full accent-indigo-500"
                                            />
                                        </div>
                                        <button 
                                            onClick={() => { setBlurBoxes(blurBoxes.filter(b => b.id !== selectedElement)); setSelectedElement(null); }}
                                            className="bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 px-4 py-2 rounded-lg text-sm font-bold transition-colors border border-red-900/50"
                                        >
                                            Remove Box
                                        </button>
                                    </div>
                                )}
                                
                                <div className="mt-6">
                                    <label className="block text-white font-bold text-sm mb-2">Watermark (ရေစတန်း)</label>
                                    <input 
                                        type="text" 
                                        value={watermarkText} 
                                        onChange={(e) => setWatermarkText(e.target.value)} 
                                        className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors"
                                    />
                                    <p className="text-gray-500 text-xs mt-2">ဗီဒီယိုပေါ်တွင် ရွေ့လျားနေမည့် စာသားထည့်ရန်</p>
                                </div>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 max-w-2xl mx-auto w-full">
                                <div className="flex items-center justify-between bg-gray-950/60 border border-gray-800 rounded-2xl px-4 py-3 mb-2">
                                    <label htmlFor="subtitleCheck" className="text-sm font-bold text-gray-300 cursor-pointer">စာတန်းထိုးမည်</label>
                                    <input type="checkbox" id="subtitleCheck" checked={burnSubtitles} onChange={e => setBurnSubtitles(e.target.checked)} className="w-5 h-5 rounded border-gray-700 bg-gray-900 text-indigo-500 focus:ring-indigo-500 cursor-pointer" />
                                </div>
                                {burnSubtitles && (
                                    <>
                                        <div>
                                            <label className="block text-white font-bold text-sm mb-2">Subtitle Color</label>
                                            <div className="flex gap-2">
                                                {['white', 'yellow', 'cyan', 'lime', 'magenta'].map(color => (
                                                    <button
                                                        key={color}
                                                        onClick={() => setSubtitleColor(color)}
                                                        className={`w-9 h-9 rounded-full transition-transform duration-200 ${subtitleColor === color ? 'scale-110 ring-2 ring-offset-2 ring-offset-gray-900 ring-indigo-500' : 'hover:scale-105'}`}
                                                        style={{ backgroundColor: color }}
                                                        title={color}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        
                                        <div 
                                            ref={previewContainerRef}
                                            className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800/80 select-none touch-none mt-4"
                                            style={{ aspectRatio: '16/9' }}
                                            onClick={() => setSelectedElement(null)}
                                        >
                                            <video 
                                                ref={videoPreviewRef}
                                                src={videoPreviewUrl || undefined}
                                                className="w-full h-full object-contain pointer-events-none opacity-50"
                                                style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }}
                                                muted playsInline
                                                onLoadedMetadata={updateVideoRect}
                                            />
                                            <div
                                                onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'move')}
                                                onClick={(e) => { e.stopPropagation(); setSelectedElement('subtitle'); }}
                                                className={`absolute border-2 cursor-move flex items-center justify-center overflow-hidden ${selectedElement === 'subtitle' ? 'border-indigo-500 bg-indigo-500/20 z-20' : 'border-gray-500 border-dashed bg-gray-500/10 z-10'}`}
                                                style={{
                                                    left: `${videoRect.left + (subtitlePosition.xPct / 100) * videoRect.width}px`,
                                                    top: `${videoRect.top + (subtitlePosition.yPct / 100) * videoRect.height}px`,
                                                    width: `${(subtitlePosition.widthPct / 100) * videoRect.width}px`,
                                                    height: `${(subtitlePosition.heightPct / 100) * videoRect.height}px`,
                                                }}
                                            >
                                                <div className="text-center font-bold px-2 pointer-events-none w-full" style={{ color: subtitleColor, fontSize: `${Math.max(10, (subtitlePosition.heightPct / 100) * videoRect.height * 0.5)}px`, textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}>
                                                    စာတန်းထိုး နေရာ
                                                </div>
                                                {selectedElement === 'subtitle' && (
                                                    <>
                                                        <div className="absolute -top-2 -left-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize shadow-md border-2 border-indigo-500" onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'tl')} />
                                                        <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize shadow-md border-2 border-indigo-500" onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'br')} />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-6 max-w-2xl mx-auto w-full">
                                <div>
                                    <label className="block text-white font-bold text-sm mb-2">အသံရွေးချယ်ရန်</label>
                                    <select 
                                        value={voiceId} 
                                        onChange={(e) => setVoiceId(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors"
                                    >
                                        {voices.map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center justify-between bg-gray-950/60 border border-gray-800 rounded-2xl px-4 py-3">
                                    <label htmlFor="voiceCloneCheck" className="text-sm font-bold text-gray-300 cursor-pointer">Clone အသံ သုံးမည်</label>
                                    <input type="checkbox" id="voiceCloneCheck" checked={useVoiceClone === 1} onChange={e => setUseVoiceClone(e.target.checked ? 1 : 0)} className="w-5 h-5 rounded border-gray-700 bg-gray-900 text-indigo-500 focus:ring-indigo-500 cursor-pointer" />
                                </div>
                                {useVoiceClone === 1 && (
                                    <div>
                                        <label className="block text-white font-bold text-sm mb-2">Reference Voice</label>
                                        <select 
                                            value={referenceVoiceId} 
                                            onChange={(e) => setReferenceVoiceId(e.target.value)}
                                            className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors"
                                        >
                                            {refVoices.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="pt-6 border-t border-gray-800/50 flex justify-between items-center mt-auto">
                            <button
                                onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                                disabled={currentStep === 1}
                                className="px-6 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 font-bold text-sm transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                            >
                                Back
                            </button>
                            
                            {currentStep < 4 ? (
                                <button
                                    onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-900/20"
                                >
                                    Next Step
                                </button>
                            ) : (
                                <button
                                    onClick={generateVideo}
                                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-600 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-900/30 transform hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Generate Video
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {status === 'generating_video' && (
                <div className="max-w-2xl mx-auto bg-gray-900 border border-gray-800 rounded-3xl p-12 text-center space-y-6">
                    <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-indigo-400 font-bold text-sm">VID</span>
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2">Generating Video...</h3>
                        <p className="text-gray-400">Cutting scenes and generating narration</p>
                    </div>
                </div>
            )}
            
            {status === 'video_error' && (
                <div className="max-w-2xl mx-auto bg-red-950/20 border border-red-900/50 rounded-3xl p-8 text-center space-y-6">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
                    <h3 className="text-xl font-bold text-red-400">Video Generation Error</h3>
                    <p className="text-red-300">{errorMsg}</p>
                    <button
                        onClick={generateVideo}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-xl transition-all"
                    >
                        Retry Generation
                    </button>
                    <button
                        onClick={reset}
                        className="text-gray-400 hover:text-white mt-4 block mx-auto text-sm"
                    >
                        Start Over
                    </button>
                </div>
            )}
            
            {status === 'video_done' && (
                <div className="max-w-4xl mx-auto bg-gray-900 border border-gray-800 rounded-3xl p-8 space-y-6 text-center">
                    <h3 className="text-2xl font-bold text-white">Video Ready!</h3>
                    <p className="text-gray-400">Your recap video with AI narration has been generated successfully.</p>
                    
                    <div className="aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 relative max-w-2xl mx-auto">
                        <video 
                            controls 
                            src={`/api/ai-recap/download/${jobId}`} 
                            className="w-full h-full object-contain"
                        />
                    </div>
                    
                    <div className="flex items-center justify-center gap-4">
                        <a
                            href={`/api/ai-recap/download/${jobId}`}
                            download
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/20 inline-flex items-center gap-2"
                        >
                            Download Video
                        </a>
                        <button
                            onClick={reset}
                            className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-xl font-bold transition-all"
                        >
                            Start New
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};
