const fs = require('fs');
let content = fs.readFileSync('src/ai/translation.js', 'utf8');

const regex1 = /case 'literal':[\s\S]*?break;/;

const newLiteral1 = `case 'literal':
            styleInstruction = \`- Provide a faithful translation of the original English text that preserves the exact meaning and key information, but MUST still be written in grammatically natural spoken Burmese.
- Avoid stiff, Google-translated English phrasing. Do NOT directly translate English word order if it creates awkward Burmese.
- Maintain standard spoken sentence-ending markers like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်" instead of written bookish forms like "သည်", "ပါသည်", "ခဲ့သည်".
- Avoid adding extra conversational fillers, slang, or colloquial expressions that are not in the original text.
- CRITICAL: Translate as faithfully and literally as possible without embellishment, invented framing, or added narrative fluff.\`;
            break;`;

// Replace the first occurrence
content = content.replace(regex1, newLiteral1);

// I should also update the literal case for scene narration just to be safe.
const regex2 = /case 'literal':[\s\S]*?break;/g;
let i = 0;
content = content.replace(regex2, (match) => {
    i++;
    if (i === 2) {
        return `case 'literal':
            styleInstruction = \`- Provide a faithful retelling of the scene that preserves the exact visual meaning and key information, written in grammatically natural spoken Burmese.
- Avoid stiff phrasing. Maintain standard spoken sentence-ending markers like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်".
- Avoid adding extra conversational fillers or slang.
- CRITICAL: Translate as faithfully and literally as possible without embellishment, invented framing, or added narrative fluff.\`;
            break;`;
    }
    return match;
});

fs.writeFileSync('src/ai/translation.js', content, 'utf8');
console.log('patched literal');
