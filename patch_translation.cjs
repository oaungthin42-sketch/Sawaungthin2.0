const fs = require('fs');
let content = fs.readFileSync('src/ai/translation.js', 'utf8');

// Change default to literal just in case
content = content.replace(/const translationStyle = getSetting\('TRANSLATION_STYLE'\) \|\| 'default_recap';/g, "const translationStyle = getSetting('TRANSLATION_STYLE') || 'literal';");

// Update literal style for getTranslationSystemInstruction (and scene narration if needed, but let's just replace both for safety or just the literal case in general)
const literalCaseReplacement = `        case 'literal':
            styleInstruction = \`- Provide a faithful translation of the original English text that preserves the exact meaning and key information, but MUST still be written in grammatically natural spoken Burmese.
- Avoid stiff, Google-translated English phrasing. Do NOT directly translate English word order if it creates awkward Burmese.
- Maintain standard spoken sentence-ending markers like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်" instead of written bookish forms like "သည်", "ပါသည်", "ခဲ့သည်".
- Avoid adding extra conversational fillers, slang, or colloquial expressions that are not in the original text.
- CRITICAL: Translate as faithfully and literally as possible without embellishment, invented framing, or added narrative fluff.\`;
            break;`;
            
// there are two 'literal' cases in the file, one in getTranslationSystemInstruction and one in getSceneNarrationSystemInstruction.
// Let's replace the first one.
const oldLiteralCase1 = `        case 'literal':
            styleInstruction = \`- Provide a faithful translation of the original English text that preserves the exact meaning and key information, but MUST still be written in grammatically natural spoken Burmese.
- Avoid stiff, Google-translated English phrasing. Do NOT directly translate English word order if it creates awkward Burmese.
- Maintain standard spoken sentence-ending markers like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်" instead of written bookish forms like "သည်", "ပါသည်", "ခဲ့သည်".
- Avoid adding extra conversational fillers, slang, or colloquial expressions that are not in the original text.\`;
            break;`;

content = content.replace(oldLiteralCase1, literalCaseReplacement);

// Add rule 10
const rule9 = `9. Character names and proper nouns: identify any character names or proper nouns in the original text (even if imperfectly transcribed) and render them as natural Burmese phonetic transliteration (e.g., a name like "John" becomes "ဂျွန်", "Maria" becomes "မာရီယာ") rather than dropping them or leaving them in the original script. Use the SAME transliteration consistently for the same character every time they are mentioned across the entire transcript — do not use different Burmese spellings for the same name in different lines.`;

const rule10 = `10. Translate as faithfully and literally as natural spoken Burmese allows — this is NOT a creative recap rewrite. Do not summarize, do not expand, do not add narrator commentary, dramatic framing, or YouTube/TikTok-style introductions. Keep each translated line's length roughly proportional to the original line — not noticeably shorter or longer. The output will be converted to speech and played over the original video, so it must say what the original text says, naturally in Burmese, nothing more and nothing less.`;

content = content.replace(rule9, rule9 + "\\n" + rule10);

fs.writeFileSync('src/ai/translation.js', content, 'utf8');
console.log('patched translation.js');
