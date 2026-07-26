const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove font states, add subtitleColor
code = code.replace(
  "  const [fonts, setFonts] = useState<any[]>([]);\n  const [selectedFontId, setSelectedFontId] = useState<string | null>(null);\n  const [fontUploadStatus, setFontUploadStatus] = useState<string>('');",
  "  const [subtitleColor, setSubtitleColor] = useState<string>('white');"
);

// 2. Remove fetchFonts
code = code.replace(/  const fetchFonts = async \(\) => \{[\s\S]*?  \};\n/m, "");

// 3. Remove handleFontUpload
code = code.replace(/  const handleFontUpload = async \([\s\S]*?  \};\n/m, "");

// 4. Remove useEffect calling fetchFonts
code = code.replace(/  useEffect\(\(\) => \{\n    fetchFonts\(\);\n  \}, \[\]\);\n/m, "");

// 5. Add subtitleColor to handleJobSubmission form data
code = code.replace(
  "formData.append('subtitlePosition', JSON.stringify(subtitlePosition));",
  "formData.append('subtitlePosition', JSON.stringify(subtitlePosition));\n    formData.append('subtitleColor', subtitleColor);"
);

// 6. Remove selectedFontId from formData
code = code.replace(
  /    if \(selectedFontId\) \{\n      formData.append\('selectedFontId', selectedFontId\);\n    \}\n/m,
  ""
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
