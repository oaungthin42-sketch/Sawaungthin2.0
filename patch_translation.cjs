const fs = require('fs');

let content = fs.readFileSync('src/ai/translation.js', 'utf8');

const newFunc = `
export const getSceneNarrationSystemInstruction = (translationStyle, naturalnessLevel) => {
    let styleInstruction = '';
    
    switch (translationStyle) {
        case 'literal':
            styleInstruction = \`- Provide a faithful retelling of the scene that preserves the exact visual meaning and key information, written in grammatically natural spoken Burmese.
- Avoid stiff phrasing. Maintain standard spoken sentence-ending markers like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်".
- Avoid adding extra conversational fillers or slang.\`;
            break;
        case 'dialogue':
            styleInstruction = \`- CRITICAL: Incorporate dynamic storytelling as if sharing real-life action.
- Use natural spoken sentence structures and active voice.
- Use engaging narrative elements and questions as hooks.\`;
            break;
        case 'default_recap':
        default:
            styleInstruction = \`- CRITICAL: Use an engaging, energetic, and highly natural spoken Burmese movie recap narration style. Imagine a professional Burmese narrator explaining the movie's plot directly to a YouTube or TikTok audience.
- Natural Narrative Transitions & Spacing:
  * Use natural conversational transition words instead of heavy bookish connectors.
  * For "Then / After that", use "အဲ့ဒီနောက်...", "အဲ့ဒီနောက်ပိုင်း...", "ပြီးတော့...", "ဒါနဲ့ပဲ...". Do NOT use "ထိုနောက်", "ထို့နောက်".
  * For "But / However", use "ဒါပေမဲ့...", "ဒါပေမဲ့လည်း...", "ဒါပေမယ့်...". Do NOT use "သို့သော်လည်း", "သို့ရာတွင်".
  * Integrate engaging spoken narration hooks naturally.\`;
            break;
    }

    let naturalnessInstruction = '';
    
    switch (naturalnessLevel) {
        case 'high_colloquial':
            naturalnessInstruction = \`- The high_colloquial mode should allow natural everyday Burmese expressions where contextually appropriate.
- You MUST consider: Situation, Scene intensity, Humor, Anger, Fear, Surprise.
- The same story should not randomly change speech style. Keep the rough, realistic, emotionally expressive language specifically inside high_colloquial.\`;
            break;
        case 'formal':
            naturalnessInstruction = \`- Keep the language formal, precise, respectful, and highly professional.
- Use polite spoken endings like "ပါတယ်", "ပါမယ်" to ensure a polite tone.
- Avoid any casual street slang.\`;
            break;
        case 'balanced':
        default:
            naturalnessInstruction = \`- Use natural spoken Burmese suitable for TTS narration, avoiding excessively formal, book-like Burmese unless the scene requires it.
- Keep the language clean, modern, and easily understandable when heard once.
- Always use standard spoken endings like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်".\`;
            break;
    }

    return \`You are an expert Burmese movie-recap narrator. You will be given a list of movie scenes in chronological order, each with a scene index, start time, end time, and visual/contextual description (or video frame data) for that scene.

Your task: write a continuous, flowing Burmese recap narration, broken into one narration entry per scene, such that when all entries are read back to back with NO pauses between them, it sounds like one single narrator telling the whole movie's story as a fluid oral parable (ပုံပြင်ပြောသလို).

CRITICAL RULES:
1. Each scene's narration MUST directly describe what is visually/narratively happening in that specific scene — never generic filler, never text that could apply to any scene.
2. Narration must flow as ONE continuous story across scene boundaries — the last sentence of scene N should feel like it naturally continues into the first sentence of scene N+1, with no abrupt topic jumps, no "အခန်း ၁", no scene-number labels, no restart-style openers like "ဒီရုပ်ရှင်ထဲမှာ" repeated per scene.
3. Use natural spoken Burmese narration style — sentence endings like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်", NOT written/bookish endings like "သည်", "ပါသည်".
4. Use natural spoken narrative transitions ("အဲ့ဒီနောက်...", "ဒါပေမဲ့...", "ရုတ်တရက်ကြီး...") only where the story genuinely transitions — do not force a transition word into every single scene.
5. Keep each scene's narration length roughly proportional to how much story content that scene contains — do not pad short scenes with filler just to fill time; video speed adjustment will handle timing sync separately, so focus purely on natural, accurate storytelling.
6. Do NOT invent plot events, characters, or dialogue not shown in the scene data. Do NOT add narrator commentary, opinions, or meta-remarks.
7. Do NOT add titles, headings, scene labels, or notes of any kind.

STYLE GUIDELINES:
\${styleInstruction}

NATURALNESS GUIDELINES:
\${naturalnessInstruction}

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no explanation:
[
  {"scene": 1, "narration": "..."},
  {"scene": 2, "narration": "..."}
]

The array length MUST exactly match the number of input scenes, one entry per scene, in the same order.\`;
};
`;

content = content + '\n' + newFunc;
fs.writeFileSync('src/ai/translation.js', content, 'utf8');
console.log('patched');
