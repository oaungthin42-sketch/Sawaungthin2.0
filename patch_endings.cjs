const fs = require('fs');
let content = fs.readFileSync('src/ai/translation.js', 'utf8');

// Replace rule 2 in getTranslationSystemInstruction
const rule2Regex = /2\. ABSOLUTELY FORBIDDEN to use written\/bookish sentence-ending markers like "သည်", "ပါသည်", "ခဲ့သည်", "အံ့", "လေသည်။"\. You MUST always use spoken endings like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်", "တာပေါ့", "ပါပဲ", "ပါ" instead\./;
const rule2Replacement = `2. ABSOLUTELY FORBIDDEN to use written/bookish sentence-ending markers like 'သည်', 'ပါသည်', 'ခဲ့သည်', 'အံ့', 'လေသည်။'. Instead, use a NATURAL VARIETY of spoken endings depending on rhythm and meaning — do not end every single sentence with the same word. Vary naturally between endings like 'တယ်', 'တာပဲ', 'တာပေါ့', 'ပါတယ်', 'လိုက်တယ်', 'ရော', 'တာကွ', 'ခဲ့တယ်', 'နေတယ်', 'ဘူး' (negatives), question/exclamation forms, etc. — exactly like a real Burmese narrator would vary their speech, never mechanically repeating the same ending sentence after sentence.`;
content = content.replace(rule2Regex, rule2Replacement);

// Replace the Spoken Sentence Endings bullet in default_recap styleInstruction (both occurrences if needed, wait, it's just one occurrence in translation style instruction)
const rule45Regex = /\* Use lively spoken endings like "တယ်", "မယ်", "ခဲ့တယ်", "ပါပဲ", "တာပေါ့", "နေတာ" instead of written final markers like "သည်", "ပါသည်", "ခဲ့သည်", "အံ့", "လေသည်။"\./;
const rule45Replacement = `* Use a NATURAL VARIETY of lively spoken endings like 'တယ်', 'တာပဲ', 'တာပေါ့', 'ပါတယ်', 'လိုက်တယ်', 'ရော', 'တာကွ', 'ခဲ့တယ်', 'နေတယ်', 'ဘူး' (negatives) instead of written final markers like "သည်", "ပါသည်", "ခဲ့သည်", "အံ့", "လေသည်။". Do not mechanically repeat the same ending for every sentence.`;
content = content.replace(rule45Regex, rule45Replacement);

// Replace rule 3 in getSceneNarrationSystemInstruction
const rule3Regex = /3\. Use natural spoken Burmese narration style — sentence endings like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်", NOT written\/bookish endings like "သည်", "ပါသည်"\./;
const rule3Replacement = `3. Use natural spoken Burmese narration style — ABSOLUTELY FORBIDDEN to use written/bookish sentence-ending markers like 'သည်', 'ပါသည်'. Instead, use a NATURAL VARIETY of spoken endings depending on rhythm and meaning — do not end every single sentence with the same word. Vary naturally between endings like 'တယ်', 'တာပဲ', 'တာပေါ့', 'ပါတယ်', 'လိုက်တယ်', 'ရော', 'တာကွ', 'ခဲ့တယ်', 'နေတယ်', 'ဘူး' (negatives), question/exclamation forms, etc. — exactly like a real Burmese narrator would vary their speech.`;
content = content.replace(rule3Regex, rule3Replacement);

fs.writeFileSync('src/ai/translation.js', content, 'utf8');
console.log('patched');
