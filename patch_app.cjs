const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove font states and add subtitleColor state
code = code.replace(
  /const \[fonts, setFonts\] = useState<any\[\]>\(\[\]\);\s*const \[selectedFontId, setSelectedFontId\] = useState<string \| null>\(null\);\s*const \[fontUploadStatus, setFontUploadStatus\] = useState<string>\(''\);/,
  "const [subtitleColor, setSubtitleColor] = useState<string>('white');"
);

// 2. Remove fetchFonts and handleFontUpload and useEffect
code = code.replace(/const fetchFonts = async \(\) => \{[\s\S]*?fetchFonts\(\);\n  \}, \[\]\);/m, "");

code = code.replace(/const handleFontUpload = async[^\n]*\n([\s\S]*?)};\n/m, "");
// handleFontUpload might be slightly different. Let's find exactly.
