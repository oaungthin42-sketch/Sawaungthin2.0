const fs = require('fs');
let content = fs.readFileSync('src/ai/index.js', 'utf8');

const regex1 = /const edgeVoice = voiceId \|\| 'male-young-adult';\s*let pitch = '-10Hz';\s*let rate = '\+0%';/;

const newLogic1 = `const voiceConfig = getVoiceConfig(voiceId);
        const edgeVoice = voiceConfig.edgeVoice;
        const pitch = voiceConfig.pitch;
        const rate = voiceConfig.rate;`;

content = content.replace(regex1, newLogic1);

const regex2 = /console\.warn\(\`\[AI\] TTS attempt \$\{attempt\} failed for chunk \$\{i\}: \$\{err\.message\}\`\);/g;
const newLogic2 = "console.warn(`[AI] TTS attempt ${attempt} failed for chunk ${i}:`, err);";

content = content.replace(regex2, newLogic2);

fs.writeFileSync('src/ai/index.js', content, 'utf8');
console.log('patched tts logic');
