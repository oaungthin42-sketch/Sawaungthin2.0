const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /\{\/\* Subtitles faintly visible \*\/\}\s*<div\s*className="absolute border-2 border-gray-500\/20 bg-gray-500\/5 transition-colors flex items-center justify-center overflow-hidden pointer-events-none"\s*style=\{\{\s*left: `\$\{subtitlePosition\.xPct\}%`,\s*top: `\$\{subtitlePosition\.yPct\}%`,\s*width: `\$\{subtitlePosition\.widthPct\}%`,\s*height: `\$\{subtitlePosition\.heightPct\}%`,\s*fontFamily: selectedFontId \? `font_\$\{selectedFontId\}` : 'inherit'\s*\}\}\s*>\s*<span className="text-white\/50 font-bold text-center flex items-center justify-center w-full h-full" style=\{\{ fontSize: `calc\(\$\{subtitlePosition\.heightPct\}vh \* 0\.4\)` \}\}>နမူနာ စာတန်း<\/span>\s*<\/div>/m,
  `{/* Subtitles faintly visible */}
                          <div
                            className="absolute border-2 border-dashed border-yellow-400/70 transition-colors pointer-events-none"
                            style={{
                              left: \`\${subtitlePosition.xPct}%\`,
                              top: \`\${subtitlePosition.yPct}%\`,
                              width: \`\${subtitlePosition.widthPct}%\`,
                              height: \`\${subtitlePosition.heightPct}%\`
                            }}
                          />`
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
