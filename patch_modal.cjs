const fs = require('fs');
const file = 'src/components/SettingsModal.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\{ id: 'ASSEMBLYAI_API_KEY', label: 'AssemblyAI API Key', placeholder: 'Enter AssemblyAI API Key\.\.\.' \},\s*/, '');

fs.writeFileSync(file, content);
