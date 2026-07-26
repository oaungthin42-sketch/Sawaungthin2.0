const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

// 1. Remove selectedFontId block and set fontName
code = code.replace(/let fontName = "Padauk";[\s\S]*?console\.log\("\[SUBTITLE\] Burning " \+ subtitles\.length \+ " subtitles using libass\.\.\."\);/,
  `let fontName = "Padauk";

                        let primaryColor = "&H00FFFFFF"; // white
                        if (job.subtitleColor === "yellow") primaryColor = "&H0000FFFF";
                        if (job.subtitleColor === "blue") primaryColor = "&H00FF0000";

                        console.log("[SUBTITLE] Burning " + subtitles.length + " subtitles using libass...");`
);

// 2. Update ASS Header (use primaryColor, set bold to -1)
code = code.replace(
  /Style: Default,\$\{fontName\},\$\{fontsize\},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,8,\$\{marginL\},\$\{marginR\},\$\{marginV\},1/,
  "Style: Default,${fontName},${fontsize},${primaryColor},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,8,${marginL},${marginR},${marginV},1"
);

// 3. Simplify filterComplex
code = code.replace(
  /const filterComplex = job\.selectedFontId[\s\S]*?: `\[0:v\]ass='\$\{assPath\.replace\(\/:\/g, '\\\\:'\)\}'\[v\]`;/,
  "const filterComplex = `[0:v]ass='${assPath.replace(/:/g, '\\\\:')}'[v]`;"
);

fs.writeFileSync('src/workers/processor.js', code, 'utf8');
