import React, { useState, useRef, useEffect } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { 
  UploadCloud, Video, AlertCircle, CheckCircle, Loader2, Download, 
  Settings, Play, ShieldAlert, RefreshCw, Menu, 
  Volume2, ArrowRight, Check 
} from 'lucide-react';
import axios from 'axios';

function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [blurBoxes, setBlurBoxes] = useState<any[]>([]);
  const [subtitlePosition, setSubtitlePosition] = useState<any>({ xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 });
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  
  const [fonts, setFonts] = useState<any[]>([]);
  const [selectedFontId, setSelectedFontId] = useState<string | null>(null);
  const [fontUploadStatus, setFontUploadStatus] = useState<string>('');
  const [showVoiceDrawer, setShowVoiceDrawer] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const fetchFonts = async () => {
    try {
      const res = await axios.get('/api/fonts');
      setFonts(res.data);
      res.data.forEach((font: any) => {
        const fontFace = new FontFace(`font_${font.id}`, `url(${font.url})`);
        fontFace.load().then(f => document.fonts.add(f)).catch(e => console.warn("Failed to load font", e));
      });
    } catch(e) {
      console.error(e);
    }
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('font', file);
      setFontUploadStatus('Uploading...');
      try {
        await axios.post('/api/fonts/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setFontUploadStatus('Uploaded!');
        fetchFonts();
        setTimeout(() => setFontUploadStatus(''), 2000);
      } catch (err: any) {
        setFontUploadStatus('Error: ' + (err.response?.data?.error || err.message));
        setTimeout(() => setFontUploadStatus(''), 4000);
      }
    }
  };

  
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoRect, setVideoRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const videoRectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });

  const updateVideoRect = () => {
    if (!previewContainerRef.current || !videoRef.current) return;
    const container = previewContainerRef.current.getBoundingClientRect();
    const videoW = videoRef.current.videoWidth;
    const videoH = videoRef.current.videoHeight;
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

  const addBlurBox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (blurBoxes.length >= 3) return;
    const newId = 'box_' + Date.now();
    setBlurBoxes([...blurBoxes, { id: newId, xPct: 35, yPct: 45, widthPct: 30, heightPct: 10, strength: 15 }]);
    setSelectedElement(newId);
  };

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
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setVideoPreviewUrl(null);
    }
  }, [videoFile]);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'complete' | 'error'>('idle');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [currentBackendStep, setCurrentBackendStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollTimer, setPollTimer] = useState<any>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showCompletedJobs, setShowCompletedJobs] = useState(false);
  const [completedJobsList, setCompletedJobsList] = useState<any[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [editSettings, setEditSettings] = useState<any>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Main page voice gender tab
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male');

  useEffect(() => {
    fetchSettings();
    fetchVoices();
  }, []);
  
  const fetchVoices = async () => {
    try {
      const res = await axios.get('/api/voices');
      setVoices(res.data);
    } catch (e) {
      console.error("Failed to load voices", e);
    }
  };
  
  const handlePreviewVoice = async (voiceId: string) => {
    setPreviewingVoice(voiceId);
    try {
        const response = await axios.post('/api/preview-voice', { voiceId }, { responseType: 'blob' });
        const url = URL.createObjectURL(response.data);
        if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
        setAudioPreviewUrl(url);
        
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => setPreviewingVoice(null);
        audio.onerror = () => setPreviewingVoice(null);
    } catch(err) {
        console.error("Voice preview failed", err);
        setPreviewingVoice(null);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      const backendSettings = { ...res.data };
      
      const geminiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      
      if (geminiKey) {
        backendSettings['GEMINI_API_KEY'] = {
          configured: true,
          masked: '•'.repeat(16) + geminiKey.slice(-4),
          value: geminiKey
        };
      } else {
        backendSettings['GEMINI_API_KEY'] = { configured: false };
      }
      
      setSettings(backendSettings);
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  };

  const saveSetting = async (key: string, value: string) => {
    if (key === 'GEMINI_API_KEY' ) {
      localStorage.setItem(key, value);
      setSettings((prev: any) => ({
        ...prev,
        [key]: {
          configured: true,
          masked: '•'.repeat(16) + value.slice(-4),
          value: value
        }
      }));
      setEditSettings({ ...editSettings, [key]: undefined });
      return;
    }

    // Optimistic UI update
    const previousSettings = { ...settings };
    setSettings({ ...settings, [key]: { configured: true, value } });
    
    setSettingsSaving(true);
    try {
      const res = await axios.post('/api/settings', { key, value });
      const backendSettings = { ...res.data };
      
      const geminiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      
      backendSettings['GEMINI_API_KEY'] = geminiKey ? {
        configured: true,
        masked: '•'.repeat(16) + geminiKey.slice(-4),
        value: geminiKey
      } : { configured: false };

      setSettings(backendSettings);
      setEditSettings({ ...editSettings, [key]: undefined });
    } catch (e) {
      console.error("Failed to save setting", e);
      setSettings(previousSettings); // Revert on failure
    } finally {
      setSettingsSaving(false);
    }
  };

  const deleteSetting = async (key: string) => {
    if (key === 'GEMINI_API_KEY' ) {
      localStorage.removeItem(key);
      setSettings((prev: any) => ({
        ...prev,
        [key]: { configured: false }
      }));
      setEditSettings({ ...editSettings, [key]: undefined });
      return;
    }

    setSettingsSaving(true);
    try {
      const res = await axios.post('/api/settings', { key, value: null });
      const backendSettings = { ...res.data };
      
      const geminiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      
      backendSettings['GEMINI_API_KEY'] = geminiKey ? {
        configured: true,
        masked: '•'.repeat(16) + geminiKey.slice(-4),
        value: geminiKey
      } : { configured: false };

      setSettings(backendSettings);
      setEditSettings({ ...editSettings, [key]: undefined });
    } catch (e) {
      console.error("Failed to delete setting", e);
    } finally {
      setSettingsSaving(false);
    }
  };

  const videoInputRef = useRef<HTMLInputElement>(null);

  const STAGES = [
    { id: 'upload', label: 'Uploading Video & Audio', steps: ['Upload', 'Extract Video Audio', 'Extract Narration Audio', 'Detect Scenes'] },
    { id: 'transcribe_orig', label: 'Transcribing Original Video', steps: ['Transcript Original'] },
    { id: 'translate', label: 'Translating to Burmese Speech', steps: ['Translate Burmese'] },
    { id: 'tts', label: 'Generating Burmese Narration', steps: ['Generate TTS Audio'] },
    { id: 'analyze_tts', label: 'Analyzing Timing & Beats', steps: ['Transcript Narration'] },
    { id: 'match', label: 'Matching Scenes Semantically', steps: ['Semantic Matching'] },
    { id: 'timeline', label: 'Synthesizing Subtitles & Timeline', steps: ['Timeline Builder', 'Subtitle Builder'] },
    { id: 'render', label: 'Rendering Final Movie Recap', steps: ['Segment Builder', 'Concat Segments', 'Export Final', 'Cleanup'] }
  ];

  const getStageIndex = (step: string) => {
    if (!step) return 0;
    for (let i = 0; i < STAGES.length; i++) {
        if (STAGES[i].steps.includes(step)) return i;
    }
    return 0;
  };

  const currentStageIndex = getStageIndex(currentBackendStep);

  useEffect(() => {
    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [pollTimer]);

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        setVideoFile(file);
      }
    }
  };

  
  const fetchCompletedJobs = async () => {
    try {
      const stored = JSON.parse(localStorage.getItem('completedJobsIds') || '[]');
      if (stored.length === 0) {
        setCompletedJobsList([]);
        return;
      }
      const res = await axios.get('/api/completed-jobs?ids=' + stored.join(','));
      setCompletedJobsList(res.data);
    } catch (e) {
      console.error('Failed to fetch completed jobs', e);
    }
  };

  useEffect(() => {
    if (showCompletedJobs) {
      fetchCompletedJobs();
    }
  }, [showCompletedJobs]);

  const startAnalysis = async () => {
    if (!videoFile) return;

    setStatus('uploading');
    setProgressMsg('Uploading video to server...');
    setProgressPct(5);

    const formData = new FormData();
    formData.append('video', videoFile);

    const geminiKey = localStorage.getItem('GEMINI_API_KEY') || '';
    formData.append('geminiApiKey', geminiKey);
    formData.append('blurBoxes', JSON.stringify(blurBoxes));
    formData.append('subtitlePosition', JSON.stringify(subtitlePosition));
    if (selectedFontId) formData.append('selectedFontId', selectedFontId);

    try {
      const response = await axios.post('/api/process-recap', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newJobId = response.data.jobId;
      
      // Track in localstorage
      try {
        const stored = JSON.parse(localStorage.getItem('completedJobsIds') || '[]');
        stored.push(newJobId);
        // keep last 200
        while (stored.length > 200) stored.shift();
        localStorage.setItem('completedJobsIds', JSON.stringify(stored));
      } catch (e) {}

      setJobId(newJobId);
      setStatus('analyzing');
      startPolling(newJobId);

    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.response?.data?.error || err.message || 'Upload failed');
    }
  };

  const startPolling = (id: string) => {
    let pollErrors = 0;
    if (pollTimer) clearInterval(pollTimer);

    const interval = setInterval(async () => {
      try {
        const statusRes = await axios.get(`/api/status/${id}`);
        const job = statusRes.data;
        
        setCurrentBackendStep(job.currentStep || 'Upload');
        
        if (job.status === 'complete') {
          clearInterval(interval);
          setAnalysisData(job.result);
          setStatus('complete');
        } else if (job.status === 'error') {
          clearInterval(interval);
          setStatus('error');
          setErrorMsg(job.error || 'Processing failed');
        } else {
          setProgressMsg(job.status === 'queued' ? 'Queued for processing...' : (job.currentStep ? `Processing: ${job.currentStep}` : 'Processing...'));
          setProgressPct(job.progress || 0);
        }
      } catch (e) {
         console.warn('Polling error (transient)', e);
         pollErrors++;
         if (pollErrors > 20) {
            clearInterval(interval);
            setStatus('error');
            setErrorMsg('Polling failed after multiple retries.');
         }
      }
    }, 5000);

    setPollTimer(interval);
  };

  const retryAnalysis = async () => {
    if (!jobId) return;
    setStatus('analyzing');
    setErrorMsg('');
    setCurrentBackendStep('Upload');
    setProgressPct(0);
    
    try {
        await axios.post(`/api/retry/${jobId}`);
        startPolling(jobId);
    } catch(err: any) {
        setStatus('error');
        setErrorMsg('Failed to retry: ' + (err.message || ''));
    }
  };

  const reset = () => {
    if (pollTimer) clearInterval(pollTimer);
    setVideoFile(null);
    setStatus('idle');
    setAnalysisData(null);
    setJobId(null);
    setCurrentBackendStep('');
  };

  // Helper values for current selections on the workspace
  const currentDialogueMode = settings['DIALOGUE_MODE']?.value === 'true';
  const currentColloquialMode = settings['COLLOQUIAL_MODE']?.value === 'true';
  const currentVoiceId = settings['EDGE_TTS_VOICE']?.value || 'male-young-adult';
  const selectedVoiceName = voices.find(v => v.id === currentVoiceId)?.name || 'တက်ကြွသောလူငယ်အသံ';

  // Check if API keys are configured in local storage
  const hasGeminiKey = !!localStorage.getItem('GEMINI_API_KEY');
  const isKeysConfigured = hasGeminiKey;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-indigo-500/30 selection:text-white">
      
      {/* Dynamic Header */}
      <header className="border-b border-gray-900 bg-gray-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Video className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-display tracking-tight text-white">Movie Recap AI Studio</h1>
              <p className="text-[11px] text-gray-500 font-medium">Professional Burmese Video Reconstructor</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status dot warning if keys are missing */}
            {!isKeysConfigured && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-xs font-semibold animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                API Keys Required
              </div>
            )}
            
            <button
              onClick={() => { setShowCompletedJobs(true); fetchCompletedJobs(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-850 text-gray-300 hover:text-white font-semibold text-xs transition-all active:scale-95"
            >
              <Menu className="w-4 h-4 text-indigo-400" />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-850 text-gray-300 hover:text-white font-semibold text-xs transition-all active:scale-95"
            >
              <Settings className="w-4 h-4 text-indigo-400" />
              ဆက်တင်များ (Settings)
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Settings Modal */}
        
      {/* Completed Jobs Modal */}
      {showCompletedJobs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300">
            <div className="bg-gray-950 border border-gray-800/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center px-6 py-5 border-b border-gray-800/50">
                    <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                        <Menu className="w-5 h-5 text-indigo-400" />
                        Completed Videos (Last 24h)
                    </h2>
                    <button onClick={() => setShowCompletedJobs(false)} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {completedJobsList.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            No completed videos in the last 24 hours.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {completedJobsList.map(job => (
                                <div key={job.jobId} className="flex items-center justify-between p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <h4 className="text-sm font-medium text-gray-200 truncate">{job.originalFilename}</h4>
                                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                            <span>{new Date(job.completedAt).toLocaleString()}</span>
                                            <span>{(job.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                                        </div>
                                    </div>
                                    <a 
                                        href={job.videoUrl} 
                                        download 
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      <SettingsModal 
          showSettings={showSettings} 
          setShowSettings={setShowSettings}
          settings={settings}
          editSettings={editSettings}
          setEditSettings={setEditSettings}
          saveSetting={saveSetting}
          deleteSetting={deleteSetting}
          settingsSaving={settingsSaving}
          showKeys={showKeys}
          setShowKeys={setShowKeys}
        />

      {/* Voice Drawer */}
      {showVoiceDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowVoiceDrawer(false)} />
          <div className="relative w-full max-w-sm bg-gray-950 border-l border-gray-800 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-gray-900 flex items-center justify-between">
              <h2 className="text-xl font-bold font-display text-white">Choose Voice</h2>
              <button onClick={() => setShowVoiceDrawer(false)} className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-gray-800 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              {/* Voice Gender Tabs */}
              <div className="flex bg-gray-900 p-1 rounded-xl mb-6">
                <button 
                  onClick={() => setSelectedGender('male')}
                  className={`flex-1 text-center py-2.5 text-sm font-bold rounded-lg transition-all ${selectedGender === 'male' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                >
                  👨 Male Voices
                </button>
                <button 
                  onClick={() => setSelectedGender('female')}
                  className={`flex-1 text-center py-2.5 text-sm font-bold rounded-lg transition-all ${selectedGender === 'female' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                >
                  👩 Female Voices
                </button>
              </div>

              <div className="space-y-3">
                {voices.filter(v => v.gender === selectedGender).map(v => {
                  const isSelected = currentVoiceId === v.id;
                  return (
                    <div 
                      key={v.id}
                      onClick={() => { saveSetting('EDGE_TTS_VOICE', v.id); }}
                      className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-indigo-950/40 border-indigo-500 shadow-sm' : 'bg-gray-900/40 border-gray-800 hover:bg-gray-800/80 hover:border-gray-700'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-indigo-400' : 'bg-gray-700'}`} />
                        <span className={`font-bold ${isSelected ? 'text-indigo-200' : 'text-gray-300'}`}>{v.name}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.id); }}
                        disabled={previewingVoice !== null}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${previewingVoice === v.id ? 'bg-indigo-500 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
                      >
                        {previewingVoice === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}


                {/* WIZARD PROGRESS BAR */}
        <div className="mb-8">
          <div className="flex items-center justify-between overflow-x-auto pb-4 custom-scrollbar max-w-5xl mx-auto px-4">
            {[
              "Upload Video",
              "Narration Mode",
              "Voice Selection",
              "Blur Mask",
              "Subtitles",
              "My Fonts",
              "Final Preview",
              "Render"
            ].map((stepLabel, i) => {
              const stepNum = i + 1;
              const isActive = (status === 'idle' && currentStep === stepNum) || (status !== 'idle' && stepNum === 8);
              const isCompleted = (status === 'idle' && currentStep > stepNum) || (status !== 'idle' && stepNum < 8);
              const isClickable = status === 'idle' && (stepNum <= currentStep || (stepNum <= 8 && videoFile));

              return (
                <div key={stepNum} className="flex items-center flex-1 last:flex-none">
                  <button
                    onClick={() => {
                        if (status === 'idle' && isClickable) setCurrentStep(stepNum);
                    }}
                    disabled={!isClickable}
                    className={`flex flex-col items-center gap-2 ${isActive ? 'text-indigo-400' : isCompleted ? 'text-emerald-400 cursor-pointer hover:text-emerald-300' : 'text-gray-600'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold transition-all ${isActive ? 'bg-indigo-950/50 border-indigo-500 shadow-lg shadow-indigo-500/20' : isCompleted ? 'bg-emerald-950/30 border-emerald-500' : 'bg-gray-900 border-gray-800'}`}>
                      {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
                    </div>
                    <span className="text-[10px] uppercase font-bold whitespace-nowrap hidden sm:block">{stepLabel}</span>
                  </button>
                  {i < 7 && (
                    <div className={`flex-1 h-[2px] mx-2 rounded-full transition-all min-w-[20px] ${isCompleted ? 'bg-emerald-500/50' : 'bg-gray-800'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 1. IDEAL WORKSPACE (IDLE STATE) */}
        {status === 'idle' && (
          <div className="space-y-6">
            
            {/* Security Quick Alert if keys are missing */}
            {!isKeysConfigured && (
              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 max-w-3xl mx-auto">
                <div className="flex gap-3">
                  <ShieldAlert className="w-5.5 h-5.5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-sm text-amber-200 block">စနစ်အသုံးပြုရန် API Key ထည့်သွင်းပေးပါ</span>
                    <span className="text-xs text-amber-400/80">ဗီဒီယို ပြန်ဆိုခြင်း စတင်ရန်အတွက် Gemini AI API key ထည့်သွင်းပေးရန် လိုအပ်ပါသည်။</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold text-xs rounded-lg transition-all self-start sm:self-auto shrink-0"
                >
                  Configure API Keys
                </button>
              </div>
            )}
            
            {/* Step 1: Upload Video */}
            {currentStep === 1 && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎬</span>
                  <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">Upload Video</h3>
                </div>
                <p className="text-xs text-gray-500 mb-5">Upload the original video you want to process.</p>
                
                <div 
                  className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer ${videoFile ? 'p-2 border-indigo-500 bg-indigo-500/5 shadow-inner' : 'p-10 border-gray-800 hover:border-gray-700 bg-gray-950/40 hover:bg-gray-950/80'}`}
                  onDragOver={handleDragOver}
                  onDrop={handleVideoDrop}
                  onClick={() => videoInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={videoInputRef} 
                    className="hidden" 
                    accept="video/*"
                    onChange={handleVideoSelect}
                  />
                  {videoFile && videoPreviewUrl ? (
                    <div ref={previewContainerRef} className="relative w-full aspect-[9/16] max-h-[70vh] mx-auto rounded-xl overflow-hidden group bg-black" onClick={(e) => e.stopPropagation()}>
                      <video
                        ref={videoRef}
                        src={videoPreviewUrl}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(e) => {
                          e.currentTarget.currentTime = 0.1;
                          updateVideoRect();
                        }}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 flex flex-col justify-end p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-black/60 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 flex items-center justify-between">
                          <div>
                            <span className="text-sm font-semibold text-white block truncate">{videoFile.name}</span>
                            <span className="text-xs text-gray-300">{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setVideoFile(null); setBlurBoxes([]); setSelectedElement(null); }}
                            className="px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white font-semibold text-xs rounded-lg transition-all"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-center text-gray-500">
                      <UploadCloud className="w-12 h-12 text-gray-600 mb-1" />
                      <span className="text-sm font-semibold text-gray-300">Drag & Drop or Click to Upload</span>
                      <span className="text-[10px] text-gray-600">MP4, MOV supported</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Narration Mode */}
            {currentStep === 2 && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📝</span>
                  <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">Narration Mode</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6">Choose how the AI should explain the video.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => saveSetting('DIALOGUE_MODE', currentDialogueMode ? 'false' : 'true')}
                    className={`flex flex-col p-4 rounded-xl border text-left transition-all ${currentDialogueMode ? 'bg-indigo-950/25 border-indigo-500 text-indigo-300 shadow-sm' : 'bg-gray-950/40 border-gray-900 text-gray-400 hover:border-gray-800 hover:text-gray-350'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold">Dialogue (A-B)</span>
                      {currentDialogueMode && <Check className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <span className="text-xs text-gray-500">Conversational style, switching between speakers.</span>
                  </button>
                     
                  <button
                    onClick={() => saveSetting('COLLOQUIAL_MODE', currentColloquialMode ? 'false' : 'true')}
                    className={`flex flex-col p-4 rounded-xl border text-left transition-all ${currentColloquialMode ? 'bg-indigo-950/25 border-indigo-500 text-indigo-300 shadow-sm' : 'bg-gray-950/40 border-gray-900 text-gray-400 hover:border-gray-800 hover:text-gray-350'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold">Colloquial</span>
                      {currentColloquialMode && <Check className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <span className="text-xs text-gray-500">Natural, everyday spoken language instead of formal text.</span>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-6 text-center opacity-70">
                  {!currentDialogueMode && !currentColloquialMode ? 'Current: Normal (Direct Translation)' : 'Multiple modes can be combined.'}
                </p>
              </div>
            )}

            {/* Step 3: Voice Selection */}
            {currentStep === 3 && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎙️</span>
                  <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">Voice Selection</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6">Choose the Voice for your generated audio track.</p>
                
                <div className="bg-indigo-950/15 border border-indigo-900/30 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-400">
                      <Volume2 className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[10px] text-indigo-400/80 uppercase tracking-wider font-bold block mb-1">Current Voice</span>
                      <span className="text-lg font-bold text-indigo-200">{selectedVoiceName}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowVoiceDrawer(true)}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
                  >
                    Choose Voice
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => handlePreviewVoice(currentVoiceId)}
                      disabled={previewingVoice !== null}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 text-xs font-semibold rounded-lg transition-colors"
                    >
                      {previewingVoice === currentVoiceId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Preview Current Voice
                    </button>
                </div>
              </div>
            )}

            {/* Step 4: Blur Mask Editor */}
            {currentStep === 4 && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🌫️</span>
                  <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">Blur Mask Editor</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6">Hide sensitive areas in the video like faces or watermarks.</p>
                
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-2/3">
                    {videoFile && videoPreviewUrl ? (
                      <div ref={previewContainerRef} className="relative w-full aspect-[9/16] max-h-[70vh] mx-auto rounded-xl overflow-hidden group bg-black" onClick={(e) => { e.stopPropagation(); setSelectedElement(null); }}>
                        <video
                          ref={videoRef}
                          src={videoPreviewUrl}
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute" style={{ left: `${videoRect.left}px`, top: `${videoRect.top}px`, width: `${videoRect.width}px`, height: `${videoRect.height}px` }}>
                          
                          {/* Subtitles faintly visible */}
                          <div
                            className="absolute border-2 border-gray-500/20 bg-gray-500/5 transition-colors flex items-center justify-center overflow-hidden pointer-events-none"
                            style={{
                              left: `${subtitlePosition.xPct}%`,
                              top: `${subtitlePosition.yPct}%`,
                              width: `${subtitlePosition.widthPct}%`,
                              height: `${subtitlePosition.heightPct}%`,
                              fontFamily: selectedFontId ? `font_${selectedFontId}` : 'inherit'
                            }}
                          >
                            <span className="text-white/50 font-bold text-center flex items-center justify-center w-full h-full" style={{ fontSize: `calc(${subtitlePosition.heightPct}vh * 0.4)` }}>နမူနာ စာတန်း</span>
                          </div>

                          {/* Blur Boxes */}
                          {blurBoxes.map((box) => (
                            <div
                              key={box.id}
                              onPointerDown={(e) => handlePointerDown(e, box.id, 'move')}
                              className={`absolute border-2 ${selectedElement === box.id ? 'border-indigo-400' : 'border-gray-400 border-dashed'} cursor-move transition-colors touch-none`}
                              style={{
                                left: `${box.xPct}%`,
                                top: `${box.yPct}%`,
                                width: `${box.widthPct}%`,
                                height: `${box.heightPct}%`,
                                backdropFilter: `blur(${box.strength * 1.2}px)`,
                                WebkitBackdropFilter: `blur(${box.strength * 1.2}px)`
                              }}
                            >
                              {selectedElement === box.id && (
                                <>
                                  <div className="absolute -top-8 left-0 bg-gray-900 border border-gray-700 rounded-md p-1 flex items-center gap-2 cursor-default" onPointerDown={e => e.stopPropagation()}>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setBlurBoxes(prev => prev.filter(b => b.id !== box.id)); setSelectedElement(null); }}
                                      className="text-red-400 hover:text-red-300 p-1"
                                      title="Delete Blur Box"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                  </div>
                                  <div onPointerDown={(e) => handlePointerDown(e, box.id, 'tl')} className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full cursor-nwse-resize touch-none" />
                                  <div onPointerDown={(e) => handlePointerDown(e, box.id, 'tr')} className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full cursor-nesw-resize touch-none" />
                                  <div onPointerDown={(e) => handlePointerDown(e, box.id, 'bl')} className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full cursor-nesw-resize touch-none" />
                                  <div onPointerDown={(e) => handlePointerDown(e, box.id, 'br')} className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full cursor-nwse-resize touch-none" />
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full aspect-[9/16] bg-gray-900 rounded-xl flex items-center justify-center text-gray-500 text-sm">Please upload a video first</div>
                    )}
                  </div>
                  
                  <div className="w-full md:w-1/3 flex flex-col gap-4">
                    <button 
                      onClick={addBlurBox}
                      disabled={blurBoxes.length >= 3 || !videoFile}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
                    >
                      + Add Blur Box
                    </button>
                    {blurBoxes.length >= 3 && <p className="text-xs text-amber-500 text-center">Maximum 3 blur boxes allowed</p>}

                    {selectedElement && blurBoxes.find(b => b.id === selectedElement) ? (
                      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                        <h4 className="text-sm font-bold text-gray-300 mb-4">Edit Blur Settings</h4>
                        <label className="text-xs text-gray-400 block mb-2">Blur Strength: {blurBoxes.find(b => b.id === selectedElement)?.strength}</label>
                        <input 
                          type="range" 
                          min="1" 
                          max="30" 
                          value={blurBoxes.find(b => b.id === selectedElement)?.strength}
                          onChange={(e) => setBlurBoxes(prev => prev.map(b => b.id === selectedElement ? { ...b, strength: parseInt(e.target.value) } : b))}
                          className="w-full accent-indigo-500 cursor-pointer mb-4"
                        />
                        <details className="mt-2 text-xs">
                          <summary className="text-gray-400 cursor-pointer hover:text-white mb-2">Advanced (manual values)</summary>
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div><label className="text-gray-500 block mb-1">X Pos (%)</label><input type="number" value={Math.round(blurBoxes.find(b => b.id === selectedElement)?.xPct || 0)} onChange={e => setBlurBoxes(prev => prev.map(b => b.id === selectedElement ? {...b, xPct: parseInt(e.target.value)} : b))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-gray-500 block mb-1">Y Pos (%)</label><input type="number" value={Math.round(blurBoxes.find(b => b.id === selectedElement)?.yPct || 0)} onChange={e => setBlurBoxes(prev => prev.map(b => b.id === selectedElement ? {...b, yPct: parseInt(e.target.value)} : b))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-gray-500 block mb-1">Width (%)</label><input type="number" value={Math.round(blurBoxes.find(b => b.id === selectedElement)?.widthPct || 0)} onChange={e => setBlurBoxes(prev => prev.map(b => b.id === selectedElement ? {...b, widthPct: parseInt(e.target.value)} : b))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-gray-500 block mb-1">Height (%)</label><input type="number" value={Math.round(blurBoxes.find(b => b.id === selectedElement)?.heightPct || 0)} onChange={e => setBlurBoxes(prev => prev.map(b => b.id === selectedElement ? {...b, heightPct: parseInt(e.target.value)} : b))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" /></div>
                          </div>
                        </details>
                      </div>
                    ) : (
                      <div className="bg-gray-950/50 border border-gray-800/50 rounded-xl p-4 text-center text-xs text-gray-500 flex items-center justify-center h-32">
                        Select a blur box on the video to edit its settings
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Subtitle Editor */}
            {currentStep === 5 && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🔤</span>
                  <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">Subtitle Position</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6">Drag and resize the box to set where subtitles will appear.</p>
                
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-2/3">
                    {videoFile && videoPreviewUrl ? (
                      <div ref={previewContainerRef} className="relative w-full aspect-[9/16] max-h-[70vh] mx-auto rounded-xl overflow-hidden group bg-black" onClick={(e) => { e.stopPropagation(); setSelectedElement(null); }}>
                        <video
                          ref={videoRef}
                          src={videoPreviewUrl}
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute" style={{ left: `${videoRect.left}px`, top: `${videoRect.top}px`, width: `${videoRect.width}px`, height: `${videoRect.height}px` }}>
                          
                          {/* Blur Boxes faintly visible */}
                          {blurBoxes.map((box) => (
                            <div
                              key={box.id}
                              className="absolute border-2 border-indigo-500/30 bg-indigo-500/10 pointer-events-none"
                              style={{
                                left: `${box.xPct}%`,
                                top: `${box.yPct}%`,
                                width: `${box.widthPct}%`,
                                height: `${box.heightPct}%`,
                              }}
                            />
                          ))}

                          <div
                            onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'move')}
                            className={`absolute border-2 ${selectedElement === 'subtitle' ? 'border-green-400 bg-transparent' : 'border-gray-400 border-dashed bg-gray-500/10'} cursor-move transition-colors flex items-center justify-center overflow-hidden touch-none`}
                            style={{
                              left: `${subtitlePosition.xPct}%`,
                              top: `${subtitlePosition.yPct}%`,
                              width: `${subtitlePosition.widthPct}%`,
                              height: `${subtitlePosition.heightPct}%`,
                              fontFamily: selectedFontId ? `font_${selectedFontId}` : 'inherit'
                            }}
                          >
                            <span className="text-white font-bold drop-shadow-md text-center flex items-center justify-center w-full h-full" style={{ fontSize: `calc(${subtitlePosition.heightPct}vh * 0.4)` }}>နမူနာ စာတန်း</span>
                            {selectedElement === 'subtitle' && (
                              <>
                                <div onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'tl')} className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-green-500 rounded-full cursor-nwse-resize touch-none" />
                                <div onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'tr')} className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-green-500 rounded-full cursor-nesw-resize touch-none" />
                                <div onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'bl')} className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-green-500 rounded-full cursor-nesw-resize touch-none" />
                                <div onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'br')} className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-green-500 rounded-full cursor-nwse-resize touch-none" />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full aspect-[9/16] bg-gray-900 rounded-xl flex items-center justify-center text-gray-500 text-sm">Please upload a video first</div>
                    )}
                  </div>
                  
                  <div className="w-full md:w-1/3">
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-gray-300 mb-4 flex items-center justify-between">
                        Subtitle Settings
                        <button onClick={() => setSelectedElement(selectedElement === 'subtitle' ? null : 'subtitle')} className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-indigo-500/10 rounded-md">Edit Size</button>
                      </h4>
                      {selectedElement === 'subtitle' ? (
                        <details className="mt-2 text-xs">
                          <summary className="text-gray-400 cursor-pointer hover:text-white mb-2">Advanced (manual values)</summary>
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div><label className="text-gray-500 block mb-1">X Pos (%)</label><input type="number" value={Math.round(subtitlePosition.xPct)} onChange={e => setSubtitlePosition((p: any) => ({...p, xPct: parseInt(e.target.value)}))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-gray-500 block mb-1">Y Pos (%)</label><input type="number" value={Math.round(subtitlePosition.yPct)} onChange={e => setSubtitlePosition((p: any) => ({...p, yPct: parseInt(e.target.value)}))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-gray-500 block mb-1">Width (%)</label><input type="number" value={Math.round(subtitlePosition.widthPct)} onChange={e => setSubtitlePosition((p: any) => ({...p, widthPct: parseInt(e.target.value)}))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-gray-500 block mb-1">Height (%)</label><input type="number" value={Math.round(subtitlePosition.heightPct)} onChange={e => setSubtitlePosition((p: any) => ({...p, heightPct: parseInt(e.target.value)}))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" /></div>
                          </div>
                        </details>
                      ) : (
                        <div className="text-xs text-gray-500 py-6 text-center">Click "Edit Size" or select the subtitle box on the video to manually adjust dimensions.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: My Fonts */}
            {currentStep === 6 && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🔤</span>
                  <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">My Fonts</h3>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-4">Upload your custom TrueType (.ttf) or OpenType (.otf) fonts for burned-in subtitles.</p>
                    
                    <div className="flex flex-col gap-3">
                      <label className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-gray-700 hover:border-indigo-500 bg-gray-950/50 hover:bg-indigo-950/20 text-gray-300 font-semibold text-sm rounded-xl cursor-pointer transition-all">
                        <UploadCloud className="w-5 h-5 text-indigo-400" />
                        Upload Custom Font
                        <input type="file" accept=".ttf,.otf" className="hidden" onChange={handleFontUpload} />
                      </label>
                      {fontUploadStatus && <div className="text-xs text-center text-indigo-400 font-medium bg-indigo-950/30 py-2 rounded-lg">{fontUploadStatus}</div>}
                    </div>
                  </div>
                  
                  <div className="flex-1 bg-gray-950/80 border border-gray-800 rounded-xl p-3 min-h-[200px] max-h-[300px] overflow-y-auto custom-scrollbar">
                    {fonts.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center text-center px-4">
                        <span className="text-2xl mb-2">📂</span>
                        <span className="text-xs text-gray-500">No custom fonts uploaded yet. Using default Noto Sans Myanmar.</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <label 
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedFontId === null ? 'bg-indigo-600 shadow-md text-white' : 'hover:bg-gray-800/80 bg-gray-900/50 text-gray-300'}`}
                        >
                          <input type="radio" name="fontSelection" checked={selectedFontId === null} onChange={() => setSelectedFontId(null)} className="hidden" />
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedFontId === null ? 'border-white' : 'border-gray-500'}`}>
                            {selectedFontId === null && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <span className="text-sm font-bold">Default (Noto Sans Myanmar)</span>
                        </label>

                        {fonts.map(font => (
                          <label 
                            key={font.id}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedFontId === font.id ? 'bg-indigo-600 shadow-md text-white' : 'hover:bg-gray-800/80 bg-gray-900/50 text-gray-300'}`}
                          >
                            <input type="radio" name="fontSelection" checked={selectedFontId === font.id} onChange={() => setSelectedFontId(font.id)} className="hidden" />
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedFontId === font.id ? 'border-white' : 'border-gray-500'}`}>
                              {selectedFontId === font.id && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <span className="text-lg" style={{ fontFamily: `font_${font.id}` }}>{font.originalName}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 7: Final Preview */}
            {currentStep === 7 && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">✨</span>
                  <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">Final Preview</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6">Review your settings before starting the AI generation.</p>
                
                <div className="flex flex-col items-center">
                  <div className="w-full max-w-sm">
                    {videoFile && videoPreviewUrl ? (
                      <div className="relative w-full aspect-[9/16] mx-auto rounded-xl overflow-hidden shadow-2xl shadow-indigo-900/20 bg-black border border-gray-800">
                        <video
                          src={videoPreviewUrl}
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 pointer-events-none" style={{ left: `0px`, top: `0px`, width: `100%`, height: `100%` }}>
                          {blurBoxes.map((box) => (
                            <div
                              key={box.id}
                              className="absolute"
                              style={{
                                left: `${box.xPct}%`,
                                top: `${box.yPct}%`,
                                width: `${box.widthPct}%`,
                                height: `${box.heightPct}%`,
                                backdropFilter: `blur(${box.strength * 1.2}px)`,
                                WebkitBackdropFilter: `blur(${box.strength * 1.2}px)`
                              }}
                            />
                          ))}
                          <div
                            className="absolute flex items-center justify-center"
                            style={{
                              left: `${subtitlePosition.xPct}%`,
                              top: `${subtitlePosition.yPct}%`,
                              width: `${subtitlePosition.widthPct}%`,
                              height: `${subtitlePosition.heightPct}%`,
                              fontFamily: selectedFontId ? `font_${selectedFontId}` : 'inherit'
                            }}
                          >
                            <span className="text-white font-bold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-center w-full" style={{ fontSize: `calc(${subtitlePosition.heightPct}vh * 0.4)` }}>နမူနာ စာတန်း</span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Step 8: Render / Actions */}
            {currentStep === 8 && (
              <div className="flex flex-col items-center justify-center pt-8 max-w-md mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-bold font-display text-white mb-2">Ready to Render</h2>
                  <p className="text-gray-400 text-sm">Your video is configured and ready for AI processing.</p>
                </div>
                {isKeysConfigured ? (
                  <button
                    onClick={startAnalysis}
                    disabled={!videoFile}
                    className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-gray-800 disabled:to-gray-800 disabled:opacity-40 text-white py-4 px-8 rounded-2xl font-bold text-lg transition-all shadow-xl shadow-indigo-900/40 active:scale-95 hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed group"
                  >
                    <Play className="w-6 h-6 fill-white group-hover:scale-110 transition-transform" />
                    <span>Start AI Processing</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 py-4 px-8 rounded-2xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-3"
                  >
                    <ShieldAlert className="w-6 h-6" />
                    <span>Please add API Keys</span>
                  </button>
                )}
              </div>
            )}
            
            {/* Navigation Controls */}
            <div className="flex items-center justify-between max-w-5xl mx-auto mt-8 pt-4 border-t border-gray-900">
              <button
                onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                disabled={currentStep === 1}
                className="px-6 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Back
              </button>
              
              {currentStep < 8 && (
                <button
                  onClick={() => setCurrentStep(prev => Math.min(8, prev + 1))}
                  disabled={currentStep === 1 && !videoFile}
                  className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Next Step
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>

          </div>
        )}


        {/* 2. PROCESSING PIPELINE WORKSPACE */}
        {(status === 'uploading' || status === 'analyzing') && (
          <div className="max-w-3xl mx-auto bg-gray-900/40 border border-gray-900 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center justify-between mb-8 pb-5 border-b border-gray-900">
                <div>
                    <h2 className="text-lg font-bold font-display text-white mb-1">ဗီဒီယို ပြန်ဆိုနေဆဲဖြစ်ပါသည် (Processing Recap)</h2>
                    <p className="text-gray-500 text-xs">AI စနစ်များဖြင့် ဗီဒီယိုကို ခွဲခြမ်းစိတ်ဖြာပြီး အသံဖိုင်ပြန်ဆိုနေပါသည် ခဏစောင့်ပေးပါ။</p>
                </div>
                <Loader2 className="w-7 h-7 text-indigo-500 animate-spin shrink-0" />
            </div>
            
            <div className="space-y-3">
                {STAGES.map((stage, idx) => {
                    let stageStatus = 'pending';
                    if (idx < currentStageIndex) stageStatus = 'completed';
                    else if (idx === currentStageIndex) stageStatus = 'active';

                    return (
                        <div key={stage.id} className={`flex items-center gap-4.5 p-3.5 rounded-xl transition-all ${stageStatus === 'active' ? 'bg-indigo-950/20 border border-indigo-500/30 shadow-md' : 'bg-gray-950/20 border border-gray-900/60'}`}>
                            <div className="w-5.5 h-5.5 flex items-center justify-center shrink-0">
                                {stageStatus === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                                {stageStatus === 'active' && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
                                {stageStatus === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-gray-800" />}
                            </div>
                            <span className={`text-xs font-bold transition-colors ${stageStatus === 'completed' ? 'text-gray-400' : stageStatus === 'active' ? 'text-indigo-300' : 'text-gray-650'}`}>
                                {stage.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Premium Interactive Progress Bar */}
            <div className="mt-8 pt-6 border-t border-gray-900">
                <div className="flex justify-between items-center mb-2.5">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{progressMsg || 'ဘာသာပြန်စနစ် စတင်နေဆဲ...'}</span>
                    <span className="text-xs font-mono font-bold text-gray-300 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">{Math.round(progressPct)}%</span>
                </div>
                <div className="w-full bg-gray-950 rounded-full h-2.5 overflow-hidden border border-gray-900 p-0.5">
                    <div 
                        className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-300 ease-out shadow-sm shadow-indigo-500/30"
                        style={{ width: `${Math.max(2, progressPct)}%` }}
                    />
                </div>
            </div>
          </div>
        )}

        {/* 3. ERROR WORKSPACE */}
        {status === 'error' && (
          <div className="max-w-2xl mx-auto bg-gray-900/40 border border-red-950/30 rounded-2xl p-8 flex flex-col shadow-xl">
             <div className="flex flex-col items-center justify-center text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-red-950/20 border border-red-900/30 flex items-center justify-center text-red-500 mb-4 animate-bounce">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold font-display text-red-400 mb-2">ပြန်ဆိုစနစ် ချို့ယွင်းချက်ရှိပါသည် (Failed)</h2>
                <div className="px-4 py-2 bg-red-950/20 border border-red-900/30 rounded-lg max-w-lg">
                  <p className="text-red-300/80 text-xs font-mono break-words">{errorMsg}</p>
                </div>
            </div>

            <div className="flex justify-center gap-4">
                <button
                  onClick={retryAnalysis}
                  className="bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 text-white font-bold text-xs py-2.5 px-5 rounded-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>ထပ်မံကြိုးစားမည် (Retry)</span>
                </button>
                <button
                  onClick={reset}
                  className="bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 font-bold text-xs py-2.5 px-5 rounded-xl transition-all hover:scale-105 active:scale-95"
                >
                  မူလနေရာသို့ ပြန်သွားမည်
                </button>
            </div>
          </div>
        )}

        {/* 4. SUCCESS & EXPORT WORKSPACE */}
        {status === 'complete' && analysisData && (
          <div className="space-y-8 max-w-4xl mx-auto">
            
            {/* Banner Complete */}
            <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
                <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold font-display text-white">ဗီဒီယိုအသစ် ပြန်ဆိုပြီးပါပြီ (Recap Complete)</h2>
                      <p className="text-emerald-300/80 text-xs mt-0.5">မြန်မာနောက်ခံစကားပြော ဗီဒီယိုအဆင်သင့်ဖြစ်ပါပြီ ဒေါင်းလုဒ်လုပ်နိုင်ပါသည်။</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={reset}
                        className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 font-bold rounded-xl text-xs transition-all active:scale-95"
                    >
                      ဗီဒီယိုအသစ် ပြုလုပ်မည်
                    </button>
                </div>
            </div>

            {/* Final Video Render Screen */}
            {analysisData.videoUrl && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-xl">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-4 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-indigo-400" />
                  ရလဒ်ဗီဒီယိုကြည့်ရှုရန် (Play Final Output)
                </h3>
                <div className="flex justify-center bg-black rounded-xl overflow-hidden border border-gray-900 relative group aspect-video max-w-2xl mx-auto shadow-2xl">
                  <video 
                    src={analysisData.videoUrl} 
                    controls 
                    className="max-h-[500px] w-auto aspect-[9/16]"
                    autoPlay
                    loop
                  />
                </div>
                <div className="mt-5 flex justify-center">
                  <a 
                    href={analysisData.videoUrl} 
                    download
                    className="bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 hover:scale-102 active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    ဗီဒီယိုဒေါင်းလုဒ်ဆွဲရန် (Download Video)
                  </a>
                </div>
              </div>
            )}

            {/* Detailed Scene Timeline Report */}
            {!import.meta.env.PROD && analysisData && (
              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-xl">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-4 pb-3 border-b border-gray-900">
                  စကားပြောနှင့် မြင်ကွင်း ချိတ်ဆက်မှု အစီရင်ခံစာ (Narration to Scene Mapping)
                </h3>
                
                {analysisData.mapping && analysisData.mapping.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1.5 custom-scrollbar">
                    {analysisData.mapping.map((mapItem: any, idx: number) => (
                      <div key={idx} className="bg-gray-950/60 border border-gray-900 rounded-xl p-4 flex flex-col md:flex-row gap-4 md:items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-teal-400 font-bold font-mono mb-1 uppercase tracking-wide">
                            Burmese Narration ({mapItem.narration_start.toFixed(1)}s - {mapItem.narration_end.toFixed(1)}s)
                          </div>
                          <p className="text-xs text-gray-200 font-medium leading-relaxed">&ldquo;{mapItem.narration_text}&rdquo;</p>
                        </div>
                        
                        <div className="hidden md:flex items-center justify-center px-2">
                          <div className="w-6 h-[1px] bg-gray-800 relative">
                            <div className="absolute -right-1 -top-1 w-2 h-2 border-t border-r border-gray-600 rotate-45"></div>
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                           <div className="text-[10px] text-indigo-400 font-bold font-mono mb-1 uppercase tracking-wide">
                            Matched Scene {mapItem.matched_scene_index + 1} (Start: {mapItem.matched_scene_start.toFixed(1)}s)
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed truncate">
                            {mapItem.matched_scene_text ? `Original: "${mapItem.matched_scene_text}"` : 'No original dialogue'}
                          </p>
                        </div>
                        
                        <div className="text-right border-t md:border-t-0 border-gray-900 pt-2.5 md:pt-0 shrink-0">
                          <div className="text-[9px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">Similarity</div>
                          <div className={`text-sm font-bold font-mono ${(mapItem.similarity_score * 100) > 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {(mapItem.similarity_score * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-550 text-xs font-medium">No mappings generated.</p>
                )}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
