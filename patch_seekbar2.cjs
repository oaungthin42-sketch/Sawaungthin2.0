const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/\{videoFile && videoPreviewUrl \? \(\s*<div ref=\{previewContainerRef\} /g, 
  '{videoFile && videoPreviewUrl ? (\n                      <div className="flex flex-col w-full">\n                      <div ref={previewContainerRef} '
);

code = code.replace(/                      <\/div>\n                    \) : \(\n                      <div className="w-full aspect-\[9\/16\] bg-gray-900 rounded-xl flex items-center justify-center text-gray-500 text-sm">Please upload a video first<\/div>\n                    \)\}/g,
  '                      </div>\n                      <VideoSeekBar videoRef={videoRef} />\n                      </div>\n                    ) : (\n                      <div className="w-full aspect-[9/16] bg-gray-900 rounded-xl flex items-center justify-center text-gray-500 text-sm">Please upload a video first</div>\n                    )}'
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
