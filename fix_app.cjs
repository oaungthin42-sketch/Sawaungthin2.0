const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/ \|\| key === 'ASSEMBLYAI_API_KEY'/g, '');
content = content.replace(/\s*const assemblyKey = localStorage\.getItem\('ASSEMBLYAI_API_KEY'\) \|\| '';/g, '');
content = content.replace(/\s*if \(assemblyKey\) \{\s*backendSettings\['ASSEMBLYAI_API_KEY'\] = \{\s*configured: true,\s*masked: '•'\.repeat\(16\) \+ assemblyKey\.slice\(-4\),\s*value: assemblyKey\s*\};\s*\} else \{\s*backendSettings\['ASSEMBLYAI_API_KEY'\] = \{ configured: false \};\s*\}/g, '');
content = content.replace(/\s*backendSettings\['ASSEMBLYAI_API_KEY'\] = assemblyKey \? \{\s*configured: true,\s*masked: '•'\.repeat\(16\) \+ assemblyKey\.slice\(-4\),\s*value: assemblyKey\s*\} : \{ configured: false \};/g, '');
content = content.replace(/\s*formData\.append\('assemblyApiKey', assemblyKey\);/g, '');
content = content.replace(/\s*const hasAssemblyKey = !!localStorage\.getItem\('ASSEMBLYAI_API_KEY'\);/g, '');
content = content.replace(/const isKeysConfigured = hasGeminiKey && hasAssemblyKey;/g, 'const isKeysConfigured = hasGeminiKey;');
content = content.replace(/စနစ်အသုံးပြုရန် API Keys များ ထည့်သွင်းပေးပါ/g, 'စနစ်အသုံးပြုရန် API Key ထည့်သွင်းပေးပါ');
content = content.replace(/ဗီဒီယို ပြန်ဆိုခြင်း စတင်ရန်အတွက် Gemini AI နှင့် AssemblyAI API key များ ထည့်သွင်းပေးရန် လိုအပ်ပါသည်။/g, 'ဗီဒီယို ပြန်ဆိုခြင်း စတင်ရန်အတွက် Gemini AI API key ထည့်သွင်းပေးရန် လိုအပ်ပါသည်။');

fs.writeFileSync(file, content);
