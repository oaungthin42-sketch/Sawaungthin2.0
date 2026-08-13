import React, { useState, useRef, useEffect } from 'react';
import { AdminPage } from './components/AdminPage';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { RecentDownloads } from './components/RecentDownloads';
import { FeedbackForm } from './components/FeedbackForm';
import { CreditGauge } from './components/CreditGauge';
import { AIRecapTool } from './components/AIRecapTool';
import { 
  UploadCloud, AlertCircle, CheckCircle, Loader2, Download, 
  Play, Menu, 
  Volume2, ArrowRight, Check, X, CreditCard, Star, Copy
} from 'lucide-react';
import axios from 'axios';

declare global {
  interface Window {
    google: any;
  }
}

const VideoSeekBar = ({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateProgress = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };
    
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
    if (video) {
      if (video.paused) video.play();
      else video.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (video && video.duration) {
      const newTime = (Number(e.target.value) / 100) * video.duration;
      video.currentTime = newTime;
      setProgress(Number(e.target.value));
    }
  };

  return (
    <div className="w-full mt-3 flex items-center gap-3 bg-gray-900/60 p-2 rounded-xl border border-gray-800">
      <button onClick={togglePlay} className="text-white hover:text-indigo-400 focus:outline-none transition-colors">
        {isPlaying ? <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <Play size={20} className="fill-current" />}
      </button>
      <input
        type="range"
        min="0"
        max="100"
        step="0.1"
        value={progress || 0}
        onChange={handleSeek}
        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
    </div>
  );
};

const CREDIT_PACKAGES = [
    { credits: 30, price: 150, bonus: 1 },
    { credits: 60, price: 300, bonus: 3 },
    { credits: 90, price: 450, bonus: 6, tag: 'အသင့်တော်ဆုံး' },
    { credits: 120, price: 600, bonus: 10 },
    { credits: 150, price: 750, bonus: 20 },
];

function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [urlVideoToken, setUrlVideoToken] = useState<string | null>(null);
  const [urlVideoMeta, setUrlVideoMeta] = useState<{ name: string; size: number } | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [isDownloadingUrl, setIsDownloadingUrl] = useState(false);
  const [urlDownloadError, setUrlDownloadError] = useState('');

  const hasVideo = !!(videoFile || urlVideoToken);
  const videoDisplayName = videoFile ? videoFile.name : (urlVideoMeta?.name || 'video.mp4');
  const videoDisplaySizeMB = videoFile
    ? (videoFile.size / (1024 * 1024)).toFixed(2)
    : (urlVideoMeta ? (urlVideoMeta.size / (1024 * 1024)).toFixed(2) : '0.00');

  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [blurBoxes, setBlurBoxes] = useState<any[]>([]);
  const [watermarkText, setWatermarkText] = useState('');
  const [subtitlePosition, setSubtitlePosition] = useState<any>({ xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 });
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [subtitleColor, setSubtitleColor] = useState<string>('white');
  const [outputSpeed, setOutputSpeed] = useState<number>(1.0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  
  
  const [showVoiceDrawer, setShowVoiceDrawer] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoRect, setVideoRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const videoRectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });

  const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'complete' | 'error'>('idle');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollTimer, setPollTimer] = useState<any>(null);

  const [voices, setVoices] = useState<any[]>([]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [editSettings, setEditSettings] = useState<any>({});
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male');
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [bankInfo, setBankInfo] = useState<{ bankName: string | null, accountName: string | null, accountNumber: string | null }>({ bankName: null, accountName: null, accountNumber: null });

  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipUploadSuccess, setSlipUploadSuccess] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(2);

  const [voiceCloneEnabled, setVoiceCloneEnabled] = useState(false);
  const [referenceVoices, setReferenceVoices] = useState<any[]>([]);
  const [useVoiceClone, setUseVoiceClone] = useState(false);
  const [selectedReferenceVoiceId, setSelectedReferenceVoiceId] = useState<string>('');

  useEffect(() => {
    axios.get('/api/auth/me').then(res => {
      const userData = res.data.user;
      setUser(userData);
      axios.get('/api/user/credits').then(r => setCredits(r.data.credits)).catch(() => {});

      // Fetch voice clone configuration if admin
      if (userData && userData.role === 'admin') {
        axios.get('/api/voice-clones/config').then(cfgRes => {
          setVoiceCloneEnabled(cfgRes.data.enabled);
          if (cfgRes.data.enabled) {
            axios.get('/api/voice-clones/reference-voices').then(refRes => {
              setReferenceVoices(refRes.data);
              if (refRes.data.length > 0) {
                setSelectedReferenceVoiceId(refRes.data[0].id);
              }
            }).catch(console.error);
          }
        }).catch(console.error);
      }
    }).catch(() => {
      setUser(null);
    }).finally(() => {
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (activeView === 'tool' && user?.role === 'admin' && voiceCloneEnabled) {
      axios.get('/api/voice-clones/reference-voices').then(refRes => {
        setReferenceVoices(refRes.data);
        if (refRes.data.length > 0 && !selectedReferenceVoiceId) {
          setSelectedReferenceVoiceId(refRes.data[0].id);
        }
      }).catch(console.error);
    }
  }, [activeView, user, voiceCloneEnabled]);

  const handleSlipUpload = async () => {
    if (!slipFile) return;
    setUploadingSlip(true);
    const formData = new FormData();
    formData.append('slip', slipFile);
    try {
        await axios.post('/api/user/payment-request', formData);
        setSlipUploadSuccess(true);
        setSlipFile(null);
    } catch (e: any) {
        alert(e.response?.data?.error || 'Failed to upload slip.');
    } finally {
        setUploadingSlip(false);
    }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  useEffect(() => {
    if (!authLoading && !user) {
        if (window.google && window.google.accounts) {
            window.google.accounts.id.initialize({
                client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy',
                callback: handleCredentialResponse
            });
            window.google.accounts.id.renderButton(
                document.getElementById('google-signin-button'),
                { theme: 'outline', size: 'large' }
            );
        }
    }
  }, [authLoading, user]);

  const handleCredentialResponse = (response: any) => {
    axios.post('/api/auth/google', { credential: response.credential }).then(res => {
      setUser(res.data.user);
      axios.get('/api/user/credits').then(r => setCredits(r.data.credits)).catch(() => {});
    }).catch(err => {
        console.error('Login failed', err.response?.data?.error || err.message);
    });
  };

  const logout = () => {
      axios.post('/api/auth/logout').then(() => {
          localStorage.removeItem('superclick_recent_jobs');
          setUser(null);
      });
  };

  const [userFeedback, setUserFeedback] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchVoices();
      fetchUserFeedback();
      fetchTelegramLink();
      fetchBankInfo();
    }
    if (user?.role === 'admin') {
      fetchSettings();
    }
  }, [user]);

  useEffect(() => {
      if (!user) return;
      const activeJobId = localStorage.getItem('superclick_active_job');
      if (!activeJobId) return;
      axios.get(`/api/status/${activeJobId}`).then(res => {
          const job = res.data;
          if (job.status === 'complete') {
              setJobId(activeJobId);
              setAnalysisData(job.result);
              setStatus('complete');
              localStorage.removeItem('superclick_active_job');
          } else if (job.status === 'error') {
              localStorage.removeItem('superclick_active_job');
          } else {
              setJobId(activeJobId);
              setStatus('analyzing');
              setAnalysisStartTime(Date.now() - (job.progress ? (job.progress / 100) * 180000 : 0));
              startPolling(activeJobId);
          }
      }).catch(() => {
          localStorage.removeItem('superclick_active_job');
      });
  }, [user]);

  const fetchTelegramLink = () => {
    axios.get('/api/telegram-link').then(res => setTelegramLink(res.data.link)).catch(() => {});
  };

  const fetchBankInfo = () => {
    axios.get('/api/bank-info').then(res => setBankInfo(res.data)).catch(() => {});
  };
  
  const fetchUserFeedback = async () => {
    try {
      const res = await axios.get('/api/user/feedback');
      const data = res.data;
      setUserFeedback(data);
      if (activeView === 'feedback') {
        const unread = data.filter((f: any) => f.isRead === 0);
        if (unread.length > 0) {
          Promise.all(unread.map((f: any) => axios.post(`/api/user/feedback/${f.id}/read`)))
            .then(() => {
               setUserFeedback(prev => prev.map(f => ({...f, isRead: 1})));
            }).catch(console.error);
        }
      }
    } catch (e) {
      console.error("Failed to load feedback", e);
    }
  };

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
    } catch(err: any) {
        console.error("Voice preview failed", err);
        const message = err?.response?.data?.error || err?.message || "Voice preview failed";
        alert(message);
        setPreviewingVoice(null);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      setSettings(res.data);
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  };

  const saveSetting = async (key: string, value: string) => {
    try {
      const res = await axios.post('/api/settings', { key, value });
      setSettings(res.data);
      setEditSettings({ ...editSettings, [key]: undefined });
    } catch (e) {
      console.error("Failed to save setting", e);
    }
  };

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

  useEffect(() => {
    if (activeView === 'tool' && user) {
      axios.get('/api/user/credits').then(r => setCredits(r.data.credits)).catch(() => {});
    }
    if (activeView === 'feedback' && user) {
      fetchUserFeedback();
    }
  }, [activeView, user]);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoPreviewUrl(url);
      return () => { URL.revokeObjectURL(url); };
    } else if (urlVideoToken) {
      setVideoPreviewUrl(`/api/temp-video/${urlVideoToken}`);
    } else {
      setVideoPreviewUrl(null);
    }
  }, [videoFile, urlVideoToken]);

  const addBlurBox = () => {
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

  const handleUrlDownload = async () => {
    if (!videoUrlInput.trim()) return;
    setIsDownloadingUrl(true);
    setUrlDownloadError('');
    try {
      const res = await axios.post('/api/download-video-url-only', { url: videoUrlInput.trim() });
      setUrlVideoToken(res.data.token);
      setUrlVideoMeta({ name: res.data.filename, size: res.data.size });
      setVideoFile(null);
    } catch (err: any) {
      setUrlDownloadError(err.response?.data?.error || 'Video download failed');
    } finally {
      setIsDownloadingUrl(false);
    }
  };

  const startAnalysis = async () => {
    if (!hasVideo) return;

    if (user?.role !== 'admin' && (credits === null || credits <= 0)) {
        setActiveView('credits');
        return;
    }

    setStatus('uploading');
    setProgressPct(5);
    setAnalysisStartTime(Date.now());

    try {
      let response;
      if (videoFile) {
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('blurBoxes', JSON.stringify(blurBoxes));
        formData.append('watermarkText', watermarkText);
        formData.append('subtitlePosition', JSON.stringify(subtitlePosition));
        formData.append('subtitleColor', subtitleColor);
        formData.append('speed', outputSpeed.toString());
        formData.append('flipped', isFlipped.toString());
        
        if (user?.role === 'admin' && voiceCloneEnabled) {
          formData.append('useVoiceClone', useVoiceClone ? 'true' : 'false');
          formData.append('referenceVoiceId', selectedReferenceVoiceId || '');
        }
        
        response = await axios.post('/api/process-recap', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        response = await axios.post('/api/process-recap-from-token', {
          token: urlVideoToken,
          blurBoxes: JSON.stringify(blurBoxes),
          watermarkText: watermarkText,
          subtitlePosition: JSON.stringify(subtitlePosition),
          subtitleColor: subtitleColor,
          speed: outputSpeed.toString(),
          flipped: isFlipped.toString(),
          ...(user?.role === 'admin' && voiceCloneEnabled ? {
            useVoiceClone: useVoiceClone ? 'true' : 'false',
            referenceVoiceId: selectedReferenceVoiceId || ''
          } : {})
        });
      }

      axios.get('/api/user/credits').then(r => setCredits(r.data.credits)).catch(() => {});

      const newJobId = response.data.jobId;
      setJobId(newJobId);
      localStorage.setItem('superclick_active_job', newJobId);
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
        
        if (job.status === 'complete') {
          clearInterval(interval);
          setAnalysisData(job.result);
          setStatus('complete');
          localStorage.removeItem('superclick_active_job');
          
          try {
             if (user && user.id) {
                 const storageKey = `superclick_recent_jobs_${user.id}`;
                 let recentJobs = JSON.parse(localStorage.getItem(storageKey) || '[]');
                 if (!recentJobs.includes(id)) {
                     recentJobs = [id, ...recentJobs].slice(0, 20);
                     localStorage.setItem(storageKey, JSON.stringify(recentJobs));
                 }
             }
          } catch(e) {}
        } else if (job.status === 'error') {
          clearInterval(interval);
          setStatus('error');
          setErrorMsg(job.error || 'Processing failed');
          localStorage.removeItem('superclick_active_job');
        } else {
          setProgressPct(job.progress || 0);
        }
      } catch (e) {
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
    setAnalysisStartTime(null);
    localStorage.removeItem('superclick_active_job');
    setCurrentStep(1);
  };

  const currentVoiceId = settings['EDGE_TTS_VOICE']?.value || 'male-young-adult';
  let selectedVoiceName = voices.find(v => v.id === currentVoiceId)?.name || 'တက်ကြွသောလူငယ်အသံ';

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">စနစ်သို့ဝင်ရောက်နေသည်...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center space-y-12">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full animate-pulse"></div>
          <div className="relative w-24 h-24 rounded-[2rem] bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-900/50">
            <img src="/logo-superclick.png" alt="SuperClick" className="w-14 h-14 object-contain" />
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          <h1 className="text-5xl font-black tracking-tighter text-white">SuperClick AI</h1>
          <p className="text-gray-400 font-medium leading-relaxed">
            သင့်ဗီဒီယိုများအတွက် အကောင်းဆုံး မြန်မာ AI အသံထပ်ခြင်း။
          </p>
        </div>

        <div className="w-full max-w-xs space-y-6">
          <div className="p-1 bg-gradient-to-r from-indigo-500/20 via-white/5 to-indigo-500/20 rounded-2xl">
            <div id="google-signin-button" className="w-full h-12 bg-gray-900 rounded-xl overflow-hidden shadow-lg border border-white/5 hover:border-white/10 transition-all"></div>
          </div>
          
          <div className="flex items-center gap-4 text-gray-700">
            <div className="flex-1 h-px bg-gray-900"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest">ခွင့်ပြုချက်ရှိသူများသာ</span>
            <div className="flex-1 h-px bg-gray-900"></div>
          </div>

          <p className="text-[10px] text-gray-600 leading-normal">
            ဝင်ရောက်ခြင်းဖြင့် သင်သည် ကျွန်ုပ်တို့၏ စည်းမျဉ်းများနှင့် ကိုယ်ရေးအချက်အလက် မူဝါဒကို သဘောတူပါသည်။
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
      if (activeView === 'tool' && credits !== null && credits <= 0 && user?.role !== 'admin') {
          return (
              <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center space-y-12">
                  <div className="w-24 h-24 bg-red-950 text-red-500 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-red-900/50 mb-4">
                      <CreditCard className="w-12 h-12" />
                  </div>
                  <h1 className="text-4xl font-black text-white">Credits မလုံလောက်ပါ</h1>
                  <p className="text-gray-400 max-w-sm">
                      ဤကိရိယာကိုသုံးရန် credits လိုအပ်ပါသည်။ ဗီဒီယိုများ ဆက်လက်လုပ်ဆောင်ရန် credits ဝယ်ယူပါ။
                  </p>
                  <button onClick={() => setActiveView('credits')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-xl font-bold transition-all">Credits ဝယ်မည်</button>
              </div>
          );
      }

      if (activeView.startsWith('admin-') && user?.role === 'admin') {
          const tab = activeView.replace('admin-', ''); // 'users' | 'jobs' | 'feedback' | 'payments' | 'settings'
          return <AdminPage onBack={() => setActiveView('dashboard')} initialTab={tab as any} />;
      }
      
      if (activeView === 'dashboard') {
          return <Dashboard 
                    credits={credits} 
                    userName={user?.name || ''} 
                    userRole={user?.role || 'user'}
                    onStartNew={() => setActiveView('tool')} 
                    onViewRecent={() => setActiveView('recent')}
                 />;
      }
      
      if (activeView === 'recent') {
          return <RecentDownloads userId={user?.id} />;
      }

      if (activeView === 'feedback') {
          return (
              <div className="max-w-2xl mx-auto space-y-6">
                  <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl">
                      <h2 className="text-2xl font-bold text-white mb-6">မှတ်ချက်ပေးရန်</h2>
                      <FeedbackForm jobId={null} />
                  </div>
                  {userFeedback.length > 0 && (
                      <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl space-y-6">
                          <h2 className="text-xl font-bold text-white mb-6">သင့်မှတ်ချက်များ</h2>
                          <div className="space-y-4">
                              {userFeedback.map((fb, i) => (
                                  <div key={i} className="p-4 bg-gray-950 border border-gray-800 rounded-2xl">
                                      <div className="flex items-center gap-2 mb-2">
                                          <span className="text-xs text-gray-500">{new Date(fb.created_at).toLocaleString()}</span>
                                          <span className="flex">
                                              {[1,2,3,4,5].map(s => (
                                                  <Star key={s} className={`w-3 h-3 ${s <= fb.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-700'}`} />
                                              ))}
                                          </span>
                                      </div>
                                      <p className="text-sm text-gray-300 mb-4">{fb.comment || <span className="italic text-gray-600">မှတ်ချက်မရှိပါ</span>}</p>
                                      {fb.adminReply && (
                                          <div className="p-3 bg-indigo-900/20 border border-indigo-500/20 rounded-xl relative">
                                              {fb.isRead === 0 && (
                                                  <span className="absolute -top-2 -right-2 flex h-4 w-4">
                                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                      <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
                                                  </span>
                                              )}
                                              <p className="text-xs font-bold text-indigo-400 mb-1">Admin ပြန်စာ</p>
                                              <p className="text-sm text-indigo-100">{fb.adminReply}</p>
                                          </div>
                                      )}
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
          );
      }

      if (activeView === 'profile') {
          return (
              <div className="max-w-2xl mx-auto space-y-6">
                  <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl space-y-6">
                      <h2 className="text-2xl font-bold text-white mb-6">ပရိုဖိုင်</h2>
                      <div className="flex items-center gap-6">
                          <div className="w-20 h-20 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-3xl uppercase">
                              {user?.name?.charAt(0) || '?'}
                          </div>
                          <div>
                              <p className="text-xl font-bold text-white">{user?.name}</p>
                              <p className="text-sm text-gray-400 font-mono">{user?.email}</p>
                              <span className="inline-block mt-2 px-3 py-1 bg-gray-800 text-gray-300 text-xs font-bold rounded-lg uppercase tracking-wider">
                                  {user?.role}
                              </span>
                          </div>
                      </div>
                      <div className="pt-6 border-t border-gray-800">
                          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">အကောင့် အချက်အလက်</h3>
                          <div className="grid grid-cols-2 gap-4">
                              <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                                  <p className="text-xs text-gray-500 font-bold uppercase mb-1">Credits</p>
                                  <p className="text-2xl font-mono text-indigo-400 font-bold">{credits ?? '...'}</p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          );
      }

      if (activeView === 'credits') {
          return (
              <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl max-w-2xl mx-auto space-y-6 text-center">
                  <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto">
                      <CreditCard className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-6">သင့် Credit လက်ကျန်</h2>
                  {user?.role === 'admin'
                      ? <div className="text-amber-400 font-bold text-4xl flex items-center justify-center gap-2">∞ Unlimited</div>
                      : (credits !== null ? <CreditGauge credits={credits} /> : <div className="text-6xl font-bold font-mono text-white tracking-tighter">...</div>)}
                  <p className="text-gray-400 my-8">Credits ကို မြန်မာ AI အသံထပ် ဗီဒီယိုများ လုပ်ဆောင်ရာတွင် အသုံးပြုပါသည်။</p>
                  
                  <div className="bg-gray-950 p-6 rounded-2xl text-left border border-gray-800 space-y-3 mb-6">
                      <h3 className="text-lg font-bold text-white mb-1">Credit Package ရွေးချယ်ပါ</h3>
                      <div className="space-y-2">
                          {CREDIT_PACKAGES.map((pkg, i) => (
                              <button
                                  key={i}
                                  onClick={() => setSelectedPackage(i)}
                                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
                                      selectedPackage === i
                                          ? 'bg-indigo-950/40 border-indigo-500'
                                          : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                                  }`}
                              >
                                  <div className="flex items-center gap-3">
                                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                          selectedPackage === i ? 'border-indigo-400' : 'border-gray-600'
                                      }`}>
                                          {selectedPackage === i && <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />}
                                      </div>
                                      <div>
                                          <p className="text-sm font-bold text-white">{pkg.credits} Credits</p>
                                          <p className="text-xs text-emerald-400">+{pkg.bonus} Free</p>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      {pkg.tag && (
                                          <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md">
                                              {pkg.tag}
                                          </span>
                                      )}
                                      <span className="text-sm font-bold text-white">{pkg.price} THB</span>
                                  </div>
                              </button>
                          ))}
                      </div>
                      <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-800">
                          <div>
                              <p className="text-xs text-gray-500">စုစုပေါင်း ရရှိမည့် Credits</p>
                              <p className="text-lg font-bold text-white">
                                  {CREDIT_PACKAGES[selectedPackage].credits + CREDIT_PACKAGES[selectedPackage].bonus} Credits
                              </p>
                          </div>
                          <span className="text-sm font-bold text-indigo-400">
                              {CREDIT_PACKAGES[selectedPackage].price} THB
                          </span>
                      </div>
                  </div>
                  
                  <div className="bg-gray-950 p-6 rounded-2xl text-left border border-gray-800 space-y-4">
                      <h3 className="text-lg font-bold text-white">ဘဏ်မှတစ်ဆင့် Credits ဝယ်ရန်</h3>
                      <div className="p-4 bg-gray-900 rounded-xl space-y-3 font-mono text-sm text-gray-300">
                          <div className="flex items-center justify-between">
                              <span className="text-gray-500">Bank:</span>
                              <span className="text-white font-bold">{bankInfo.bankName || '-'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                              <span className="text-gray-500">Account Name:</span>
                              <span className="text-white font-bold">{bankInfo.accountName || '-'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                              <span className="text-gray-500">Account Number:</span>
                              <div className="flex items-center gap-2">
                                  <span className="text-white font-bold">{bankInfo.accountNumber || '-'}</span>
                                  <button
                                      onClick={() => copyToClipboard(bankInfo.accountNumber || '')}
                                      className="text-indigo-400 hover:text-indigo-300"
                                      title="Copy account number"
                                  >
                                      <Copy className="w-4 h-4" />
                                  </button>
                              </div>
                          </div>
                      </div>
                      
                      {slipUploadSuccess ? (
                          <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl font-medium flex items-center gap-2">
                              <CheckCircle className="w-5 h-5" />
                              Submitted — waiting for admin approval.
                          </div>
                      ) : (
                          <div className="space-y-4 mt-6">
                              <p className="text-sm text-gray-400">ငွေလွှဲပြီးပါက အောက်တွင် ငွေလွှဲဖြတ်ပိုင်းကို တင်ပေးပါ။</p>
                              <div className="flex items-center gap-4">
                                  <input 
                                      type="file" 
                                      accept="image/*"
                                      onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                                      className="flex-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20"
                                  />
                              </div>
                              <button 
                                  onClick={handleSlipUpload}
                                  disabled={!slipFile || uploadingSlip}
                                  className="w-full bg-indigo-600 disabled:bg-gray-800 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold transition-all disabled:text-gray-500 flex items-center justify-center gap-2"
                              >
                                  {uploadingSlip && <Loader2 className="w-4 h-4 animate-spin" />}
                                  ငွေလွှဲဖြတ်ပိုင်း တင်မည်
                              </button>
                          </div>
                      )}
                  </div>
              </div>
          );
      }

      if (activeView === 'ai-recap-beta') {
          return <AIRecapTool />;
      }

      // Default: Video Tool
      return (
          <div className="space-y-6">
              {/* WIZARD PROGRESS BAR */}
              <div className="mb-8 w-full max-w-full overflow-x-hidden">
                <div className="flex items-center justify-between overflow-x-auto pb-4 custom-scrollbar max-w-5xl mx-auto px-4">
                  {[
                    "ဗီဒီယိုနှင့် အသံ",
                    "Blur ပြုလုပ်ခြင်း",
                    "စာတန်းနှင့် ဖောင့်များ",
                    "ထုတ်လုပ်မည်"
                  ].map((stepLabel, i) => {
                    const stepNum = i + 1;
                    const isActive = (status === 'idle' && currentStep === stepNum) || (status !== 'idle' && stepNum === 4);
                    const isCompleted = (status === 'idle' && currentStep > stepNum) || (status !== 'idle' && stepNum < 4);
                    const isClickable = status === 'idle' && (stepNum <= currentStep || (stepNum <= 4 && hasVideo));

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
                        {i < 3 && (
                          <div className={`flex-1 h-[2px] mx-2 rounded-full transition-all min-w-[10px] sm:min-w-[20px] ${isCompleted ? 'bg-emerald-500/50' : 'bg-gray-800'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 1. IDEAL WORKSPACE (IDLE STATE) */}
              {status === 'idle' && (
                  <div className="space-y-6">
                      {currentStep === 1 && (
                        <div className="space-y-6">
                            <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-lg sm:text-xl">🎬</span>
                                    <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">ဗီဒီယို တင်ရန်</h3>
                                </div>
                                <p className="text-xs text-gray-500 mb-5">သင်လုပ်ဆောင်လိုသော မူရင်းဗီဒီယိုကို တင်ပါ။</p>
                                
                                <div className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer ${hasVideo ? 'p-2 border-indigo-500 bg-indigo-500/5 shadow-inner' : 'p-10 border-gray-800 hover:border-gray-700 bg-gray-950/40 hover:bg-gray-950/80'}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) { setVideoFile(e.dataTransfer.files[0]); setUrlVideoToken(null); setUrlVideoMeta(null); } }} onClick={() => videoInputRef.current?.click()}>
                                    <input type="file" ref={videoInputRef} className="hidden" accept="video/*" onChange={(e) => { if (e.target.files && e.target.files[0]) { setVideoFile(e.target.files[0]); setUrlVideoToken(null); setUrlVideoMeta(null); } }} />
                                    {hasVideo && videoPreviewUrl ? (
                                        <div className="flex flex-col w-full">
                                            <div ref={previewContainerRef} className="relative w-full aspect-[9/16] max-h-[50vh] sm:max-h-[70vh] mx-auto rounded-xl overflow-hidden group bg-black" onClick={(e) => e.stopPropagation()}>
                                                <video ref={videoRef} src={videoPreviewUrl} muted playsInline preload="metadata" style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }} onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.1; updateVideoRect(); }} className="w-full h-full object-contain" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 flex flex-col justify-end p-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <div className="bg-black/60 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 flex items-center justify-between">
                                                        <div><span className="text-sm font-semibold text-white block truncate">{videoDisplayName}</span><span className="text-xs text-gray-300">{videoDisplaySizeMB} MB</span></div>
                                                        <button onClick={(e) => { e.stopPropagation(); setVideoFile(null); setUrlVideoToken(null); setUrlVideoMeta(null); setVideoUrlInput(''); }} className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"><X size={16} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                            <VideoSeekBar videoRef={videoRef} />
                                        </div>
                                    ) : (
                                        <div className="text-center space-y-3">
                                            <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto text-indigo-400"><UploadCloud className="w-8 h-8" /></div>
                                            <div><p className="text-sm font-bold text-white">ဗီဒီယိုကို ဤနေရာသို့ ဆွဲချပါ သို့မဟုတ် နှိပ်ပါ</p><p className="text-[10px] text-gray-600 font-medium">MP4, MOV 100MB အထိ</p></div>
                                        </div>
                                    )}
                                </div>
                                {!hasVideo && (
                                  <div className="mt-3 max-w-3xl mx-auto">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 h-px bg-gray-800" />
                                      <span className="text-[10px] text-gray-600 font-bold uppercase">သို့မဟုတ်</span>
                                      <div className="flex-1 h-px bg-gray-800" />
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                      <input
                                        type="text"
                                        value={videoUrlInput}
                                        onChange={(e) => setVideoUrlInput(e.target.value)}
                                        placeholder="YouTube / TikTok URL ကို ဒီမှာ ကူးထည့်ပါ"
                                        className="flex-1 bg-gray-950 border border-gray-800 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                                      />
                                      <button
                                        onClick={handleUrlDownload}
                                        disabled={isDownloadingUrl || !videoUrlInput.trim()}
                                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl"
                                      >
                                        {isDownloadingUrl ? 'ဒေါင်းလုတ်ဆွဲနေသည်...' : 'အသုံးပြုမည်'}
                                      </button>
                                    </div>
                                    {urlDownloadError && <p className="text-[10px] text-red-400 mt-2">{urlDownloadError}</p>}
                                  </div>
                                )}
                            </div>
                            
                            {hasVideo && (
                              <div className="flex flex-row justify-center gap-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
                                  <div className="flex items-center gap-3 bg-gray-900/50 px-4 py-2 rounded-xl border border-gray-800 flex-1 justify-between sm:flex-none">
                                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">အမြန်နှုန်း</span>
                                      <select value={outputSpeed} onChange={(e) => setOutputSpeed(parseFloat(e.target.value))} className="bg-gray-950 border border-gray-700 text-white text-xs font-bold rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500">
                                          <option value="0.9">0.9x</option>
                                          <option value="1">1.0x</option>
                                          <option value="1.1">1.1x</option>
                                          <option value="1.25">1.25x</option>
                                          <option value="1.5">1.5x</option>
                                      </select>
                                  </div>
                                  <div className="flex items-center gap-3 bg-gray-900/50 px-4 py-2 rounded-xl border border-gray-800 flex-1 justify-between sm:flex-none">
                                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">ဗီဒီယို လှည့်ရန်</span>
                                      <button onClick={() => setIsFlipped(!isFlipped)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isFlipped ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                          <ArrowRight size={14} className={`transition-transform duration-300 ${isFlipped ? 'rotate-180' : ''}`} />
                                      </button>
                                  </div>
                              </div>
                            )}

                            <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Volume2 className="w-5 h-5 text-indigo-400" />
                                        <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">အသံ ပြောင်းရန်</h3>
                                    </div>
                                    <button onClick={() => setShowVoiceDrawer(true)} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-400/5 px-2 py-1 rounded-md border border-indigo-500/20">အသံ ပြောင်းမည်</button>
                                </div>
                                <div className="flex items-center gap-4 bg-gray-950/60 p-4 rounded-xl border border-gray-800">
                                    <div className="w-12 h-12 bg-indigo-600/10 rounded-xl flex items-center justify-center text-xl">{selectedGender === 'male' ? '👨' : '👩'}</div>
                                    <div className="flex-1">
                                        <span className="text-sm font-bold text-white">{selectedVoiceName}</span>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Active Burmese Recapitulator</p>
                                    </div>
                                    <button onClick={() => handlePreviewVoice(currentVoiceId)} disabled={previewingVoice !== null} className="p-2 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all">{previewingVoice === (currentVoiceId) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}</button>
                                </div>
                            </div>
                            
                            {user?.role === 'admin' && voiceCloneEnabled && (
                              <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto mt-6 space-y-4 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">👥</span>
                                    <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">Voice Cloning (Admin)</h3>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      checked={useVoiceClone} 
                                      onChange={(e) => setUseVoiceClone(e.target.checked)} 
                                      className="sr-only peer" 
                                    />
                                    <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                                  </label>
                                </div>
                                
                                {useVoiceClone && (
                                  <div className="space-y-3 animate-in fade-in duration-300">
                                    {referenceVoices.length === 0 ? (
                                      <p className="text-xs text-amber-400 bg-amber-950/20 p-3 rounded-xl border border-amber-900/30">
                                        {"သင်တန်းပေးထားသော voice embedding မရှိသေးပါ။ Reference voice ကို Admin Area > Voice Clone တက်ဘ်တွင် အရင်ဆုံး တင်ပေးပါ။"}
                                      </p>
                                    ) : (
                                      <div className="flex flex-col gap-2">
                                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Select Reference Voice</label>
                                        <select 
                                          value={selectedReferenceVoiceId} 
                                          onChange={(e) => setSelectedReferenceVoiceId(e.target.value)}
                                          className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                                        >
                                          {referenceVoices.map((voice) => (
                                            <option key={voice.id} value={voice.id}>
                                              {voice.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            

                        </div>
                      )}

                      {currentStep === 2 && (
                        <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg sm:text-xl">🌫️</span>
                            <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">Blur ပြုလုပ်ရန် ကိရိယာ</h3>
                          </div>
                          <p className="text-xs text-gray-500 mb-6">မျက်နှာ သို့မဟုတ် ရေစာကဲ့သို့သော ဖုံးကွယ်လိုသည့်နေရာများကို ဖုံးကွယ်ပါ။</p>
                          
                          <div className="flex flex-col md:flex-row gap-6">
                            <div className="w-full md:w-2/3">
                              {hasVideo && videoPreviewUrl ? (
                                <div className="flex flex-col w-full">
                                <div ref={previewContainerRef} className="relative w-full aspect-[9/16] max-h-[50vh] sm:max-h-[70vh] mx-auto rounded-xl overflow-hidden group bg-black" onClick={() => setSelectedElement(null)}>
                                  <video ref={videoRef} src={videoPreviewUrl} muted playsInline onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.1; updateVideoRect(); }} style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }} className="w-full h-full object-contain" />
                                  <div className="absolute" style={{ left: `${videoRect.left}px`, top: `${videoRect.top}px`, width: `${videoRect.width}px`, height: `${videoRect.height}px` }}>
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
                                            <div onPointerDown={(e) => handlePointerDown(e, box.id, 'tl')} className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full cursor-nwse-resize touch-none" />
                                            <div onPointerDown={(e) => handlePointerDown(e, box.id, 'br')} className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full cursor-nwse-resize touch-none" />
                                          </>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <VideoSeekBar videoRef={videoRef} />
                                </div>
                              ) : null}
                            </div>
                            <div className="w-full md:w-1/3 flex flex-col gap-4">
                              <button onClick={addBlurBox} disabled={blurBoxes.length >= 3 || !hasVideo} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all">+ Blur Box ထည့်ရန်</button>
                              {selectedElement && blurBoxes.find(b => b.id === selectedElement) ? (
                                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                                  <label className="text-xs text-gray-400 block mb-2">Blur ပြင်းအား: {blurBoxes.find(b => b.id === selectedElement)?.strength}</label>
                                  <input type="range" min="1" max="30" value={blurBoxes.find(b => b.id === selectedElement)?.strength} onChange={(e) => setBlurBoxes(prev => prev.map(b => b.id === selectedElement ? { ...b, strength: parseInt(e.target.value) } : b))} className="w-full accent-indigo-500" />
                                  <button onClick={() => { setBlurBoxes(prev => prev.filter(b => b.id !== selectedElement)); setSelectedElement(null); }} className="w-full mt-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold">ဖယ်ရှားမည်</button>
                                </div>
                              ) : <p className="text-xs text-gray-500 text-center italic">ပြင်ဆင်ရန် Box တစ်ခုကို ရွေးပါ</p>}
                              <div className="mt-4 pt-4 border-t border-gray-800">
                                <label className="text-xs text-gray-400 block mb-2 font-bold uppercase tracking-wide">Watermark (ရေစာတန်း)</label>
                                <input
                                  type="text"
                                  value={watermarkText}
                                  onChange={(e) => setWatermarkText(e.target.value)}
                                  placeholder="SuperClick"
                                  maxLength={30}
                                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                                />
                                <p className="text-[10px] text-gray-500 mt-2">ဗီဒီယိုပေါ်တွင် ရွေ့လျားနေမည့် စာသားထည့်ရန်</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {currentStep === 3 && (
                        <div className="bg-gray-900/40 border border-gray-900 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg sm:text-xl">🔤</span>
                            <h3 className="font-bold text-sm text-gray-200 uppercase tracking-wide">စာတန်းနှင့် အပြင်အဆင်</h3>
                          </div>
                          <div className="flex flex-col md:flex-row gap-6">
                            <div className="w-full md:w-2/3">
                              {hasVideo && videoPreviewUrl ? (
                                <div className="flex flex-col w-full">
                                  <div ref={previewContainerRef} className="relative w-full aspect-[9/16] max-h-[50vh] sm:max-h-[70vh] mx-auto rounded-xl overflow-hidden group bg-black" onClick={() => setSelectedElement(null)}>
                                    <video ref={videoRef} src={videoPreviewUrl} muted playsInline onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.1; updateVideoRect(); }} style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }} className="w-full h-full object-contain" />
                                    <div className="absolute" style={{ left: `${videoRect.left}px`, top: `${videoRect.top}px`, width: `${videoRect.width}px`, height: `${videoRect.height}px` }}>
                                      <div onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'move')} className={`absolute border-2 ${selectedElement === 'subtitle' ? 'border-green-400' : 'border-gray-400 border-dashed'} cursor-move transition-colors flex items-center justify-center touch-none`} style={{ left: `${subtitlePosition.xPct}%`, top: `${subtitlePosition.yPct}%`, width: `${subtitlePosition.widthPct}%`, height: `${subtitlePosition.heightPct}%` }}>
                                        <span className="text-white font-bold text-center w-full drop-shadow-md" style={{ fontSize: `calc(${subtitlePosition.heightPct}vh * 0.4)`, color: subtitleColor }}>နမူနာ စာတန်း</span>
                                        {selectedElement === 'subtitle' && (
                                          <>
                                            <div onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'tl')} className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-green-500 rounded-full" />
                                            <div onPointerDown={(e) => handlePointerDown(e, 'subtitle', 'br')} className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-green-500 rounded-full" />
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <VideoSeekBar videoRef={videoRef} />
                                </div>
                              ) : null}
                            </div>
                            <div className="w-full md:w-1/3 space-y-6">
                                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">အရောင် ရွေးချယ်ရန်</h4>
                                  <div className="flex flex-wrap gap-3">
                                    {['white', 'yellow', 'cyan', 'lime', 'magenta'].map(c => (
                                      <button key={c} onClick={() => setSubtitleColor(c)} className={`w-8 h-8 rounded-lg border-2 ${subtitleColor === c ? 'border-indigo-500 scale-110 shadow-lg' : 'border-gray-800'}`} style={{ backgroundColor: c }} />
                                    ))}
                                  </div>
                                </div>
                                <button onClick={() => setSelectedElement('subtitle')} className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold rounded-xl border border-gray-800">နေရာ ရွှေ့ရန်</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {currentStep === 4 && (
                        <div className="flex flex-col items-center justify-center py-10 max-w-md mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                           <div className="text-center">
                              <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-4 text-indigo-400">
                                  <Play className="w-10 h-10 fill-current" />
                              </div>
                              <h2 className="text-2xl font-bold text-white mb-2">အသင့်ဖြစ်ပါပြီ</h2>
                              <p className="text-gray-400 text-sm">မြန်မာ AI အသံထပ်ရန် အသင့်ဖြစ်ပါပြီ။ AI ဖြင့် စတင်လုပ်ဆောင်ပါမည်။</p>
                           </div>
                           {credits !== null && credits <= 0 && user?.role !== 'admin' ? (
                             <div className="w-full p-4 bg-amber-950/20 border border-amber-900/30 rounded-2xl text-center">
                               <p className="text-amber-400 text-sm font-bold">Credits မလုံလောက်ပါ</p>
                             </div>
                           ) : (
                             <button onClick={startAnalysis} disabled={!hasVideo} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg rounded-2xl shadow-xl shadow-indigo-900/30 transition-all hover:scale-[1.02] active:scale-95">AI ဖြင့် လုပ်ဆောင်မည်</button>
                           )}
                        </div>
                      )}
                  </div>
              )}

              {/* Navigation Controls */}
              {status === 'idle' && (
                <div className="flex items-center justify-between max-w-3xl mx-auto mt-8 pt-4 border-t border-gray-900">
                  <button onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))} disabled={currentStep === 1} className="px-6 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 font-semibold text-sm disabled:opacity-30">နောက်သို့</button>
                  {currentStep < 4 && (
                    <button onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))} disabled={currentStep === 1 && !hasVideo} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold text-sm rounded-xl flex items-center gap-2">ရှေ့သို့ <ArrowRight size={16} /></button>
                  )}
                </div>
              )}

              {/* Status screens */}
              {(status === 'uploading' || status === 'analyzing') && (
                  <div className="max-w-3xl mx-auto bg-gray-900/40 border border-gray-900 rounded-3xl p-12 text-center space-y-8 shadow-2xl">
                      <div className="relative w-24 h-24 mx-auto">
                        <Loader2 className="w-full h-full text-indigo-500 animate-spin" />
                        <div className="absolute inset-4 bg-indigo-500/10 rounded-full border border-indigo-500/20" />
                      </div>
                      <div className="space-y-3">
                        <h2 className="text-3xl font-bold text-white font-display tracking-tight">{status === 'uploading' ? 'တင်နေသည်...' : 'လုပ်ဆောင်နေသည်...'}</h2>
                        <p className="text-gray-500 text-sm max-w-xs mx-auto">
                            {(() => {
                                if (!analysisStartTime || progressPct <= 2) {
                                    return 'သင့်ဗီဒီယိုကို AI ဖြင့် လုပ်ဆောင်နေပါသည်။ ခဏစောင့်ပေးပါ။';
                                }
                                const elapsedSec = (Date.now() - analysisStartTime) / 1000;
                                const estTotalSec = elapsedSec / (progressPct / 100);
                                const remainingSec = Math.max(0, estTotalSec - elapsedSec);
                                const remainingMin = Math.max(1, Math.round(remainingSec / 60));
                                return `သင့်ဗီဒီယိုကို AI ဖြင့် လုပ်ဆောင်နေပါသည်။ ခန့်မှန်းခြေ ${remainingMin} မိနစ်ခန့် ကျန်ရှိပါသည်။`;
                            })()}
                        </p>
                      </div>
                      <div className="w-full max-w-md mx-auto space-y-4">
                        <div className="flex justify-between text-[10px] font-bold text-indigo-400 uppercase tracking-widest px-1"><span>Global Progress</span><span>{Math.round(progressPct)}%</span></div>
                        <div className="w-full bg-gray-950 h-3 rounded-full overflow-hidden p-0.5 border border-gray-900"><div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} /></div>
                      </div>
                  </div>
              )}

              {status === 'error' && (
                <div className="max-w-2xl mx-auto bg-gray-900/40 border border-red-900/30 rounded-3xl p-10 text-center space-y-6 shadow-2xl">
                    <div className="w-16 h-16 bg-red-950/30 text-red-500 rounded-2xl flex items-center justify-center mx-auto border border-red-500/20"><AlertCircle className="w-8 h-8" /></div>
                    <h2 className="text-2xl font-bold text-red-400 font-display">လုပ်ဆောင်မှု မအောင်မြင်ပါ</h2>
                    <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl text-xs font-mono text-red-300/80 break-words">{errorMsg}</div>
                    <div className="flex justify-center gap-4 pt-4">
                      <button onClick={retryAnalysis} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center gap-2">ပြန်ကြိုးစားမည်</button>
                      <button onClick={reset} className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold rounded-xl">အစသို့ ပြန်သွားမည်</button>
                    </div>
                </div>
              )}

              {status === 'complete' && analysisData && (
                <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700">
                    <div className="bg-gray-900/40 border border-gray-900 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
                        <div className="flex items-center gap-5">
                          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20"><CheckCircle className="w-8 h-8" /></div>
                          <div>
                            <h2 className="text-2xl font-bold text-white font-display">အောင်မြင်ပါပြီ!</h2>
                            <p className="text-emerald-400/70 text-sm">သင့်မြန်မာဗီဒီယို အသင့်ဖြစ်ပါပြီ။</p>
                          </div>
                        </div>
                        <button onClick={reset} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all active:scale-95">အသစ်ပြန်လုပ်မည်</button>
                    </div>

                    {analysisData.videoUrl && (
                      <div className="bg-gray-900/40 border border-gray-900 rounded-3xl p-8 shadow-2xl">
                          <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-gray-800 shadow-inner group relative">
                              <video src={analysisData.videoUrl} controls className="w-full h-full object-contain" />
                          </div>
                          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                              <a href={analysisData.videoUrl} download className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-900/30 transition-all hover:scale-105"><Download className="w-5 h-5" /> မြန်မာဗီဒီယို ဒေါင်းလုဒ်လုပ်ရန်</a>
                          </div>
                          {analysisData.coverText && (
                              <div className="mt-6 bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                                  <p className="text-sm text-gray-300 flex-1">{analysisData.coverText}</p>
                                  <button
                                      onClick={() => navigator.clipboard.writeText(analysisData.coverText)}
                                      className="shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg"
                                  >
                                      Copy
                                  </button>
                              </div>
                          )}
                          <div className="mt-12 pt-8 border-t border-gray-800"><FeedbackForm jobId={jobId} /></div>
                      </div>
                    )}
                </div>
              )}
          </div>
      );
  };

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: Menu },
    { id: 'tool', label: 'Video Tool', icon: Play },
    { id: 'recent', label: 'Recent Downloads', icon: Download },
    { id: 'credits', label: 'Credits', icon: CreditCard },
    { id: 'ai-recap-beta', label: 'AI Movie Recap (Beta)', icon: Play },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-indigo-500/30 selection:text-white w-full max-w-full overflow-x-hidden">
      
      <Navigation 
        isOpen={isNavOpen}
        onClose={() => setIsNavOpen(false)}
        activeView={activeView}
        onNavigate={setActiveView}
        user={user}
        onLogout={logout}
        unreadFeedbackCount={userFeedback.filter(f => f.isRead === 0).length}
        telegramLink={telegramLink}
      />

      <div className="lg:pl-[280px] min-h-screen flex flex-col">
          <header className="border-b border-gray-900 bg-gray-950/80 backdrop-blur-md sticky top-0 z-40 h-16 flex items-center px-4 sm:px-8 justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => setIsNavOpen(true)} className="lg:hidden p-2 text-gray-500 hover:text-white"><Menu className="w-6 h-6" /></button>
                <h1 className="text-lg font-bold font-display tracking-tight text-white">{NAV_ITEMS.find(i => i.id === activeView)?.label || 'SuperClick'}</h1>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveView('ai-recap-beta')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg shadow-indigo-900/20 transition-all border border-indigo-500 hidden sm:block"
                >
                  AI Movie Recap (Beta)
                </button>
                <div className="hidden sm:flex items-center gap-3 px-4 py-1.5 bg-gray-900 border border-gray-800 rounded-full">
                  {user?.role === 'admin'
                    ? <span className="text-amber-400 font-bold flex items-center gap-1">∞ Unlimited</span>
                    : (credits !== null ? <CreditGauge credits={credits} size="small" /> : <span className="text-xs text-indigo-400 font-bold">... Credits</span>)}
                  <div className="w-px h-3 bg-gray-800" />
                  <span className="text-xs text-gray-400">{user?.name}</span>
                </div>
              </div>
          </header>

          <main className="max-w-7xl mx-auto w-full p-4 sm:p-8 flex-1">
              {renderContent()}
          </main>
      </div>

      {showVoiceDrawer && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-950 border border-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
                <div className="flex justify-between items-center px-6 py-5 border-b border-gray-900">
                    <h2 className="text-xl font-bold text-white">အသံထပ်ရန် အသံကို ရွေးချယ်ပါ</h2>
                    <button onClick={() => setShowVoiceDrawer(false)} className="p-2 text-gray-500 hover:text-white bg-gray-900 rounded-xl transition-colors"><X size={20} /></button>
                </div>
                <div className="p-4 bg-gray-950 border-b border-gray-900 flex gap-2">
                    <button onClick={() => setSelectedGender('male')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${selectedGender === 'male' ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-500'}`}>MALE</button>
                    <button onClick={() => setSelectedGender('female')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${selectedGender === 'female' ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-500'}`}>FEMALE</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">Voice (Edge TTS)</h3>
                        {voices.filter(v => v.gender === selectedGender).map(voice => (
                            <button key={voice.id} onClick={() => { saveSetting('EDGE_TTS_VOICE', voice.id); setShowVoiceDrawer(false); }} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left group ${currentVoiceId === voice.id ? 'bg-indigo-500/10 border-indigo-500 text-indigo-300' : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${currentVoiceId === voice.id ? 'bg-indigo-500 text-white' : 'bg-gray-800'}`}>{selectedGender === 'male' ? '👨' : '👩'}</div>
                                    <div><span className="text-sm font-bold group-hover:text-white">{voice.name}</span><p className="text-[10px] text-gray-600 uppercase font-bold mt-0.5">{voice.id}</p></div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={(e) => { e.stopPropagation(); handlePreviewVoice(voice.id); }} disabled={previewingVoice !== null} className="p-2 bg-gray-900/50 hover:bg-gray-800 text-gray-400 hover:text-indigo-500 rounded-lg transition-all border border-gray-800">
                                        {previewingVoice === voice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                    </button>
                                    {currentVoiceId === voice.id && <CheckCircle size={20} className="text-indigo-500" />}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

export default App;
