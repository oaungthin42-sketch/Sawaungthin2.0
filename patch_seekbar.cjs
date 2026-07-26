const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const seekbarComponent = `
const VideoSeekBar = ({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) => {
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
`;

code = code.replace("function App() {", seekbarComponent + "\nfunction App() {");

// Add <VideoSeekBar videoRef={videoRef} /> below the previewContainerRef div in both Step 4 and Step 5

code = code.replace(
  /(\s*)<\/div>\s*<\/div>\s*<\/div>\s*<div className="w-full md:w-1\/3">/g,
  "$1  <VideoSeekBar videoRef={videoRef} />\n$1</div>\n                      </div>\n                    ) : null}\n                  </div>\n                  <div className=\"w-full md:w-1/3\">"
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
