const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /<div className="flex items-center gap-3">\s*<div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500\/20">\s*<Video className="w-5\.5 h-5\.5 text-white" \/>\s*<\/div>\s*<div>\s*<h1 className="text-lg font-bold font-display tracking-tight text-white">Movie Recap AI Studio<\/h1>\s*<p className="text-\[11px\] text-gray-500 font-medium">Professional Burmese Video Reconstructor<\/p>\s*<\/div>\s*<\/div>/,
  `<div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center logo-glow">
              <img src="/logo-superclick.png" alt="SuperClick Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold font-display tracking-tight text-white truncate">SuperClick</h1>
              <p className="text-[11px] text-gray-500 font-medium hidden sm:block truncate">Professional Burmese Video Reconstructor</p>
            </div>
          </div>`
);

// Settings button replacement
const settingsBtnRe = /<button\s*onClick=\{\(\) => setShowSettings\(true\)\}\s*className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-850 text-gray-300 hover:text-white font-semibold text-xs transition-all active:scale-95"\s*>\s*<Settings className="w-4 h-4 text-indigo-400" \/>\s*ဆက်တင်များ \(Settings\)\s*<\/button>/;

code = code.replace(settingsBtnRe,
  `<button 
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-2 sm:px-4 py-2 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-850 text-gray-300 hover:text-white font-semibold text-xs transition-all active:scale-95"
            >
              <Settings className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">ဆက်တင်များ (Settings)</span>
            </button>`
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
