const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

code = code.replace(
    /\} catch\(e\) \{\s*console\.error\("\[SUBTITLE\] Error burning subtitles:", e\);\s*\}/g,
    `} catch(e) {
                    console.error("[SUBTITLE] Error burning subtitles:", e);
                    state.warnings.push("⚠ Subtitles could not be burned in: " + e.message);
                }`
);

fs.writeFileSync('src/workers/processor.js', code, 'utf8');
