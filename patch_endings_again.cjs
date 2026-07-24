const fs = require('fs');
let content = fs.readFileSync('src/ai/translation.js', 'utf8');

const replacementText = `Vary both sentence structure and sentence endings naturally, like a real Burmese speaker telling a story — never use the same ending word (e.g. 'လိုက်တယ်') in two consecutive sentences. Also vary HOW each sentence is built: don't repeat the same '[Subject] က [Verb]လိုက်တယ်' template over and over — sometimes lead with time/place/context, sometimes combine two actions into one sentence with a connector, sometimes use a short reactive sentence, sometimes end with a question or exclamation. Forbidden written endings remain 'သည်', 'ပါသည်', 'ခဲ့သည်', 'အံ့', 'လေသည်။'. Acceptable spoken endings include 'တယ်', 'တာပဲ', 'တာပေါ့', 'ပါတယ်', 'လိုက်တယ်', 'ရော', 'တာကွ', 'ခဲ့တယ်', 'နေတယ်', 'ဘူး' (negatives), question/exclamation forms — pick whichever fits the rhythm of THAT specific sentence, not a fixed rotation.`;

// Replace rule 2 in getTranslationSystemInstruction
const rule2Regex = /2\. ABSOLUTELY FORBIDDEN to use written\/bookish sentence-ending markers like 'သည်', 'ပါသည်', 'ခဲ့သည်', 'အံ့', 'လေသည်။'\. Instead, use a NATURAL VARIETY of spoken endings depending on rhythm and meaning — do not end every single sentence with the same word\. Vary naturally between endings like 'တယ်', 'တာပဲ', 'တာပေါ့', 'ပါတယ်', 'လိုက်တယ်', 'ရော', 'တာကွ', 'ခဲ့တယ်', 'နေတယ်', 'ဘူး' \(negatives\), question\/exclamation forms, etc\. — exactly like a real Burmese narrator would vary their speech, never mechanically repeating the same ending sentence after sentence\./;
content = content.replace(rule2Regex, "2. " + replacementText);

// Replace the Spoken Sentence Endings bullet in default_recap styleInstruction
const rule45Regex = /\* Use a NATURAL VARIETY of lively spoken endings like 'တယ်', 'တာပဲ', 'တာပေါ့', 'ပါတယ်', 'လိုက်တယ်', 'ရော', 'တာကွ', 'ခဲ့တယ်', 'နေတယ်', 'ဘူး' \(negatives\) instead of written final markers like "သည်", "ပါသည်", "ခဲ့သည်", "အံ့", "လေသည်။"\. Do not mechanically repeat the same ending for every sentence\./;
content = content.replace(rule45Regex, "* " + replacementText);

// Replace rule 3 in getSceneNarrationSystemInstruction
const rule3Regex = /3\. Use natural spoken Burmese narration style — ABSOLUTELY FORBIDDEN to use written\/bookish sentence-ending markers like 'သည်', 'ပါသည်'\. Instead, use a NATURAL VARIETY of spoken endings depending on rhythm and meaning — do not end every single sentence with the same word\. Vary naturally between endings like 'တယ်', 'တာပဲ', 'တာပေါ့', 'ပါတယ်', 'လိုက်တယ်', 'ရော', 'တာကွ', 'ခဲ့တယ်', 'နေတယ်', 'ဘူး' \(negatives\), question\/exclamation forms, etc\. — exactly like a real Burmese narrator would vary their speech\./;
content = content.replace(rule3Regex, "3. Use natural spoken Burmese narration style — " + replacementText);

fs.writeFileSync('src/ai/translation.js', content, 'utf8');
console.log('patched');
