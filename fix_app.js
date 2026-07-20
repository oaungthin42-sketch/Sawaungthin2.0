import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const missingPart = `        {/* Upload State */}
        {status === 'idle' && (
          <div className="flex flex-col items-center mt-8">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl w-full">
              <div className="flex items-center justify-center gap-3 text-indigo-400 mb-2">
                <Video className="w-6 h-6" />
                <h2 className="font-medium text-xl text-gray-200">Original Video</h2>
              </div>
              <p className="text-sm text-gray-400 text-center">Upload the video to be processed.</p>
                            
              <div 
                className={\`border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-16 transition-colors cursor-pointer \${videoFile ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-gray-800 hover:border-gray-700 bg-gray-950'}\`}
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
                                
                {videoFile ? (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <span className="text-lg font-medium text-indigo-300 truncate max-w-[300px]">{videoFile.name}</span>
                    <span className="text-sm text-gray-500">{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center text-gray-500">
                    <UploadCloud className="w-16 h-16 mb-4" />
                    <span className="text-lg font-medium">Drag & drop or click</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center mt-8">
              <button
                onClick={startAnalysis}
                disabled={!videoFile}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-indigo-900/20 text-lg"
              >
                Start AI Pipeline
              </button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {(status === 'uploading' || status === 'analyzing') && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-800">
                <div>
                    <h2 className="text-xl font-medium text-white mb-1">Processing Pipeline</h2>
                    <p className="text-gray-400 text-sm">Please wait while the AI analyzes and reconstructs your video.</p>
                </div>
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
            
            <div className="space-y-4">
                {STAGES.map((stage, idx) => {
                    let stageStatus = 'pending';
                    if (idx < currentStageIndex) stageStatus = 'completed';
                    else if (idx === currentStageIndex) stageStatus = 'active';

                    return (
                        <div key={stage.id} className={\`flex items-center gap-4 p-4 rounded-xl transition-colors \${stageStatus === 'active' ? 'bg-indigo-900/20 border border-indigo-500/30' : 'bg-gray-950/50 border border-gray-800/50'}\`}>
                            {/* Icon */}
                            <div className={\`w-6 h-6 flex items-center justify-center shrink-0\`}>
                                {stageStatus === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                                {stageStatus === 'active' && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
                                {stageStatus === 'pending' && <div className="w-2 h-2 rounded-full bg-gray-700" />}
                            </div>
                            <span className={\`font-medium \${stageStatus === 'completed' ? 'text-gray-300' : stageStatus === 'active' ? 'text-indigo-300' : 'text-gray-600'}\`}>
                                {stage.label}
                            </span>
                        </div>
                    );
                })}
                
                {/* Completed Stage Placeholder (always pending until status === 'complete') */}
                <div className={\`flex items-center gap-4 p-4 rounded-xl transition-colors bg-gray-950/50 border border-gray-800/50\`}>
                    <div className={\`w-6 h-6 flex items-center justify-center shrink-0\`}>
                        <div className="w-2 h-2 rounded-full bg-gray-700" />
                    </div>
                    <span className="font-medium text-gray-600">
                        Completed
                    </span>
                </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="mt-8 pt-6 border-t border-gray-800">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">{progressMsg || 'Processing...'}</span>
                    <span className="text-xs font-mono text-gray-400">{Math.round(progressPct)}%</span>
                </div>
                <div className="w-full bg-gray-950 rounded-full h-2 overflow-hidden border border-gray-800">
                    <div 
                        className="bg-indigo-500 h-full transition-all duration-300 ease-out"
                        style={{ width: \`\${Math.max(2, progressPct)}%\` }}
                    />
                </div>
            </div>
          </div>
        )}
`;

// Insert it right before {/* Error State */}
content = content.replace('{/* Error State */}', missingPart + '\n        {/* Error State */}');

// And we also have `        />\n            </div>\n          </div>\n        )}` in our current file right before {/* Error State */} because of my bad patch.
// Let's clean that up.
content = content.replace(/\s*<\/div>\n\s*<\/div>\n\s*\)\}\n\s*(?=\{)/, '\n\n');

fs.writeFileSync('src/App.tsx', content);
console.log("Fixed App.tsx missing parts!");
