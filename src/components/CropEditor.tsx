import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Crop, RotateCcw, Check, X, Play } from 'lucide-react';

export interface CropRect {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export type AspectRatioPreset = 'free' | 'original' | '9:16' | '16:9' | '1:1' | '4:5';

interface CropEditorProps {
  videoUrl: string;
  initialCrop?: CropRect | null;
  onApply: (crop: CropRect | null) => void;
  onCancel: () => void;
}

const PRESETS: { id: AspectRatioPreset; label: string; ratio?: number }[] = [
  { id: 'free', label: 'လွတ်လပ်စွာ (Free)' },
  { id: 'original', label: 'မူရင်း (Original)' },
  { id: '9:16', label: '9:16 (Shorts/TikTok)', ratio: 9 / 16 },
  { id: '16:9', label: '16:9 (YouTube)', ratio: 16 / 9 },
  { id: '1:1', label: '1:1 (စတုရန်း)', ratio: 1 },
  { id: '4:5', label: '4:5 (Instagram)', ratio: 4 / 5 },
];

export const CropEditor: React.FC<CropEditorProps> = ({
  videoUrl,
  initialCrop,
  onApply,
  onCancel,
}) => {
  const [crop, setCrop] = useState<CropRect>(() => {
    if (initialCrop && initialCrop.widthPct > 0 && initialCrop.heightPct > 0) {
      return { ...initialCrop };
    }
    return { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 };
  });

  const [selectedPreset, setSelectedPreset] = useState<AspectRatioPreset>('free');
  const [videoDims, setVideoDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const dragRef = useRef<{
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
    startX: number;
    startY: number;
    startCrop: CropRect;
    rect: DOMRect;
    ratioPct: number | null;
  } | null>(null);

  // Metadata loaded
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const vw = video.videoWidth || 1080;
    const vh = video.videoHeight || 1920;
    setVideoDims({ width: vw, height: vh });
    setDuration(video.duration || 0);
    video.currentTime = 0.1;
  };

  // Video playback
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const newTime = (parseFloat(e.target.value) / 100) * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  // Compute preset ratio in terms of (widthPct / heightPct)
  const getPresetRatioPct = useCallback((preset: AspectRatioPreset): number | null => {
    if (preset === 'free') return null;
    if (!videoDims.width || !videoDims.height) return null;

    let targetRatio = 1;
    if (preset === 'original') {
      targetRatio = videoDims.width / videoDims.height;
    } else {
      const p = PRESETS.find(x => x.id === preset);
      if (p && p.ratio) targetRatio = p.ratio;
    }
    // ratio in percent: (wPct / hPct) = targetRatio * (videoHeight / videoWidth)
    return targetRatio * (videoDims.height / videoDims.width);
  }, [videoDims]);

  // Apply preset button click
  const applyPreset = (preset: AspectRatioPreset) => {
    setSelectedPreset(preset);
    if (preset === 'free') return;

    const ratioPct = getPresetRatioPct(preset);
    if (!ratioPct) return;

    let newW = 100;
    let newH = newW / ratioPct;
    if (newH > 100) {
      newH = 100;
      newW = newH * ratioPct;
    }

    const newX = (100 - newW) / 2;
    const newY = (100 - newH) / 2;

    setCrop({
      xPct: Math.max(0, Math.round(newX * 10) / 10),
      yPct: Math.max(0, Math.round(newY * 10) / 10),
      widthPct: Math.min(100, Math.round(newW * 10) / 10),
      heightPct: Math.min(100, Math.round(newH * 10) / 10),
    });
  };

  // Reset to full frame
  const handleReset = () => {
    setSelectedPreset('free');
    setCrop({ xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 });
  };

  // Apply crop
  const handleSave = () => {
    const isFull =
      crop.xPct <= 0.01 &&
      crop.yPct <= 0.01 &&
      crop.widthPct >= 99.9 &&
      crop.heightPct >= 99.9;

    if (isFull) {
      onApply(null);
    } else {
      onApply({
        xPct: Math.round(crop.xPct * 100) / 100,
        yPct: Math.round(crop.yPct * 100) / 100,
        widthPct: Math.round(crop.widthPct * 100) / 100,
        heightPct: Math.round(crop.heightPct * 100) / 100,
      });
    }
  };

  // Pointer drag handling
  const startDrag = (
    e: React.PointerEvent,
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const ratioPct = getPresetRatioPct(selectedPreset);

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      rect,
      ratioPct,
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    const { type, startX, startY, startCrop, rect, ratioPct } = dragRef.current;

    const dxPct = ((e.clientX - startX) / rect.width) * 100;
    const dyPct = ((e.clientY - startY) / rect.height) * 100;
    const minSize = 10; // minimum percentage

    if (type === 'move') {
      let newX = startCrop.xPct + dxPct;
      let newY = startCrop.yPct + dyPct;
      newX = Math.max(0, Math.min(100 - startCrop.widthPct, newX));
      newY = Math.max(0, Math.min(100 - startCrop.heightPct, newY));
      setCrop({ ...startCrop, xPct: newX, yPct: newY });
      return;
    }

    let { xPct, yPct, widthPct, heightPct } = startCrop;

    if (!ratioPct) {
      // Freeform dragging
      if (type.includes('w')) {
        const potentialW = startCrop.widthPct - dxPct;
        if (potentialW >= minSize && startCrop.xPct + dxPct >= 0) {
          xPct = startCrop.xPct + dxPct;
          widthPct = potentialW;
        }
      }
      if (type.includes('e')) {
        const potentialW = startCrop.widthPct + dxPct;
        if (potentialW >= minSize && startCrop.xPct + potentialW <= 100) {
          widthPct = potentialW;
        }
      }
      if (type.includes('n')) {
        const potentialH = startCrop.heightPct - dyPct;
        if (potentialH >= minSize && startCrop.yPct + dyPct >= 0) {
          yPct = startCrop.yPct + dyPct;
          heightPct = potentialH;
        }
      }
      if (type.includes('s')) {
        const potentialH = startCrop.heightPct + dyPct;
        if (potentialH >= minSize && startCrop.yPct + potentialH <= 100) {
          heightPct = potentialH;
        }
      }
    } else {
      // Aspect ratio locked
      if (type === 'se') {
        let newW = startCrop.widthPct + dxPct;
        let newH = newW / ratioPct;
        if (startCrop.xPct + newW > 100) {
          newW = 100 - startCrop.xPct;
          newH = newW / ratioPct;
        }
        if (startCrop.yPct + newH > 100) {
          newH = 100 - startCrop.yPct;
          newW = newH * ratioPct;
        }
        if (newW >= minSize && newH >= minSize) {
          widthPct = newW;
          heightPct = newH;
        }
      } else if (type === 'sw') {
        let newW = startCrop.widthPct - dxPct;
        let newH = newW / ratioPct;
        if (startCrop.xPct + dxPct < 0) {
          newW = startCrop.xPct + startCrop.widthPct;
          newH = newW / ratioPct;
        }
        if (startCrop.yPct + newH > 100) {
          newH = 100 - startCrop.yPct;
          newW = newH * ratioPct;
        }
        if (newW >= minSize && newH >= minSize) {
          xPct = startCrop.xPct + startCrop.widthPct - newW;
          widthPct = newW;
          heightPct = newH;
        }
      } else if (type === 'ne') {
        let newW = startCrop.widthPct + dxPct;
        let newH = newW / ratioPct;
        if (startCrop.xPct + newW > 100) {
          newW = 100 - startCrop.xPct;
          newH = newW / ratioPct;
        }
        if (startCrop.yPct + startCrop.heightPct - newH < 0) {
          newH = startCrop.yPct + startCrop.heightPct;
          newW = newH * ratioPct;
        }
        if (newW >= minSize && newH >= minSize) {
          yPct = startCrop.yPct + startCrop.heightPct - newH;
          widthPct = newW;
          heightPct = newH;
        }
      } else if (type === 'nw') {
        let newW = startCrop.widthPct - dxPct;
        let newH = newW / ratioPct;
        if (startCrop.xPct + dxPct < 0) {
          newW = startCrop.xPct + startCrop.widthPct;
          newH = newW / ratioPct;
        }
        if (startCrop.yPct + startCrop.heightPct - newH < 0) {
          newH = startCrop.yPct + startCrop.heightPct;
          newW = newH * ratioPct;
        }
        if (newW >= minSize && newH >= minSize) {
          xPct = startCrop.xPct + startCrop.widthPct - newW;
          yPct = startCrop.yPct + startCrop.heightPct - newH;
          widthPct = newW;
          heightPct = newH;
        }
      } else {
        // Dragging edge with aspect locked unlocks to freeform
        setSelectedPreset('free');
        if (type === 'w') {
          const potW = startCrop.widthPct - dxPct;
          if (potW >= minSize && startCrop.xPct + dxPct >= 0) {
            xPct = startCrop.xPct + dxPct;
            widthPct = potW;
          }
        } else if (type === 'e') {
          const potW = startCrop.widthPct + dxPct;
          if (potW >= minSize && startCrop.xPct + potW <= 100) widthPct = potW;
        } else if (type === 'n') {
          const potH = startCrop.heightPct - dyPct;
          if (potH >= minSize && startCrop.yPct + dyPct >= 0) {
            yPct = startCrop.yPct + dyPct;
            heightPct = potH;
          }
        } else if (type === 's') {
          const potH = startCrop.heightPct + dyPct;
          if (potH >= minSize && startCrop.yPct + potH <= 100) heightPct = potH;
        }
      }
    }

    setCrop({
      xPct: Math.max(0, Math.min(100 - minSize, xPct)),
      yPct: Math.max(0, Math.min(100 - minSize, yPct)),
      widthPct: Math.max(minSize, Math.min(100 - xPct, widthPct)),
      heightPct: Math.max(minSize, Math.min(100 - yPct, heightPct)),
    });
  }, [selectedPreset, getPresetRatioPct]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  // Calculate live dimensions readout
  const estWidth = videoDims.width ? Math.round((crop.widthPct / 100) * videoDims.width) : 0;
  const estHeight = videoDims.height ? Math.round((crop.heightPct / 100) * videoDims.height) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-gray-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Crop size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">ဗီဒီယို ဖြတ်ညှပ်ရန် (Crop Video)</h3>
              <p className="text-[10px] sm:text-xs text-gray-400">
                ဘောင်ကို ဆွဲရွှေ့/ချဲ့ပြီး လိုချင်သော နေရာကို ရွေးချယ်ပါ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {estWidth > 0 && estHeight > 0 && (
              <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-mono text-indigo-300">
                {estWidth} × {estHeight} px
              </span>
            )}
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Video Canvas Container */}
        <div className="relative flex-1 bg-black flex items-center justify-center p-3 sm:p-6 min-h-[260px] max-h-[55vh] overflow-hidden select-none">
          <div
            ref={containerRef}
            className="relative max-h-[50vh] max-w-full overflow-hidden shadow-2xl rounded-lg touch-none"
            style={{
              aspectRatio: videoDims.width && videoDims.height ? `${videoDims.width} / ${videoDims.height}` : undefined,
              height: '100%',
            }}
          >
            <video
              ref={videoRef}
              src={videoUrl}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full h-full object-contain pointer-events-none"
            />

            {/* Crop Overlay Area */}
            <div
              onPointerDown={(e) => startDrag(e, 'move')}
              className="absolute border-2 border-indigo-400 cursor-move touch-none group"
              style={{
                left: `${crop.xPct}%`,
                top: `${crop.yPct}%`,
                width: `${crop.widthPct}%`,
                height: `${crop.heightPct}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.70)',
              }}
            >
              {/* 3x3 Rule-of-thirds grid */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-0 right-0 top-1/3 border-b border-white/25" />
                <div className="absolute left-0 right-0 top-2/3 border-b border-white/25" />
                <div className="absolute top-0 bottom-0 left-1/3 border-r border-white/25" />
                <div className="absolute top-0 bottom-0 left-2/3 border-r border-white/25" />
              </div>

              {/* Corner Handles */}
              {/* Top-Left */}
              <div
                onPointerDown={(e) => startDrag(e, 'nw')}
                className="absolute -top-3 -left-3 w-7 h-7 flex items-center justify-center cursor-nwse-resize touch-none z-10"
              >
                <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow" />
              </div>
              {/* Top-Right */}
              <div
                onPointerDown={(e) => startDrag(e, 'ne')}
                className="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center cursor-nesw-resize touch-none z-10"
              >
                <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow" />
              </div>
              {/* Bottom-Left */}
              <div
                onPointerDown={(e) => startDrag(e, 'sw')}
                className="absolute -bottom-3 -left-3 w-7 h-7 flex items-center justify-center cursor-nesw-resize touch-none z-10"
              >
                <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow" />
              </div>
              {/* Bottom-Right */}
              <div
                onPointerDown={(e) => startDrag(e, 'se')}
                className="absolute -bottom-3 -right-3 w-7 h-7 flex items-center justify-center cursor-nwse-resize touch-none z-10"
              >
                <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow" />
              </div>

              {/* Edge Handles */}
              {/* Top edge */}
              <div
                onPointerDown={(e) => startDrag(e, 'n')}
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-4 flex items-center justify-center cursor-ns-resize touch-none z-10"
              >
                <div className="w-6 h-1.5 bg-white/90 rounded-full shadow" />
              </div>
              {/* Bottom edge */}
              <div
                onPointerDown={(e) => startDrag(e, 's')}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-4 flex items-center justify-center cursor-ns-resize touch-none z-10"
              >
                <div className="w-6 h-1.5 bg-white/90 rounded-full shadow" />
              </div>
              {/* Left edge */}
              <div
                onPointerDown={(e) => startDrag(e, 'w')}
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-10 flex items-center justify-center cursor-ew-resize touch-none z-10"
              >
                <div className="w-1.5 h-6 bg-white/90 rounded-full shadow" />
              </div>
              {/* Right edge */}
              <div
                onPointerDown={(e) => startDrag(e, 'e')}
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-10 flex items-center justify-center cursor-ew-resize touch-none z-10"
              >
                <div className="w-1.5 h-6 bg-white/90 rounded-full shadow" />
              </div>

              {/* Center Dimension Badge */}
              <div className="absolute top-2 left-2 bg-black/75 px-2 py-0.5 rounded text-[10px] text-white font-mono pointer-events-none">
                {Math.round(crop.widthPct)}% × {Math.round(crop.heightPct)}%
              </div>
            </div>
          </div>
        </div>

        {/* Video Scrubber & Playback Bar */}
        <div className="px-5 py-2.5 bg-gray-900/40 border-t border-gray-800 flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="text-white hover:text-indigo-400 p-1.5 rounded-lg bg-gray-800 transition-colors focus:outline-none"
            title={isPlaying ? 'ခေတ္တရပ်မည်' : 'ဖွင့်မည်'}
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <Play size={16} className="fill-current" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={duration ? (currentTime / duration) * 100 : 0}
            onChange={handleSeek}
            className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span className="text-[11px] font-mono text-gray-400 whitespace-nowrap">
            {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
        </div>

        {/* Aspect Ratio Presets Bar */}
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-950 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            <span className="text-xs font-bold text-gray-400 uppercase mr-1 whitespace-nowrap">အချိုးအစား:</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedPreset === preset.id
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white border border-gray-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 text-xs font-medium transition-colors"
          >
            <RotateCcw size={13} />
            <span>မူလအတိုင်း</span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-gray-800 bg-gray-900/80 flex items-center justify-between">
          <div className="text-[11px] text-gray-400">
            {estWidth > 0 && (
              <span>
                ရလဒ်အရွယ်အစား: <strong className="text-indigo-300">{estWidth} × {estHeight}</strong> px
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              မလုပ်တော့ပါ
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Check size={15} />
              <span>အတည်ပြုမည်</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
