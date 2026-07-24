import { getSetting } from '../services/settings.js';

export const getTranslationSystemInstruction = () => {
    const translationStyle = getSetting('TRANSLATION_STYLE') || 'literal';
    const naturalnessLevel = getSetting('BURMESE_NATURALNESS') || 'balanced';

    let styleInstruction = '';
    
    switch (translationStyle) {
        case 'literal':
            styleInstruction = `- Provide a faithful translation of the original English text that preserves the exact meaning and key information, but MUST still be written in grammatically natural spoken Burmese.
- Avoid stiff, Google-translated English phrasing. Do NOT directly translate English word order if it creates awkward Burmese.
- Maintain standard spoken sentence-ending markers like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်" instead of written bookish forms like "သည်", "ပါသည်", "ခဲ့သည်".
- Avoid adding extra conversational fillers, slang, or colloquial expressions that are not in the original text.
- CRITICAL: Translate as faithfully and literally as possible without embellishment, invented framing, or added narrative fluff.`;
            break;
        case 'dialogue':
            styleInstruction = `
- CRITICAL: Translate as if it is a natural, real-life spoken dialogue between characters, NOT written narration or book text.
- Pronoun Adaptation based on Relationship & Emotion:
  * Do NOT use formal/bookish written pronouns like "သင်", "မိမိ", "၎င်း" or "သူမ" (she - written).
  * Select natural spoken pronouns matching the gender, age, relationship, and emotional situation:
    - "I" can be "ငါ" (casual/peers), "ကျွန်တော်" (polite male), "ကျွန်မ" (polite female).
    - "You" can be "မင်း" (casual male/general), "နင်" (casual/peer), "ခင်ဗျား" (polite male listener), "ရှင်" (polite female listener), or relational words like "အကို", "အမ", "ဦးလေး".
    - "She/He" can be "သူ" (casual spoken/general), "သူမ" (use "သူ" in spoken dialogue instead).
- Natural Sentence Patterns & Idioms:
  * Do NOT translate English grammar or passive voice directly (e.g., "He was punched by him" should NOT be "သူ့အား လက်သီးဖြင့် ထိုးခြင်းခံရသည်" -> rewrite as active voice "သူ သူ့ကို ထိုးလိုက်တယ်").
  * Use natural spoken sentence structures. For example, "What are you doing here?" depending on context should be "ဟေ့ မင်းဒီမှာဘာလုပ်နေတာလဲ။" or "မင်းကဒီကိုဘာလာလုပ်တာလဲ။" instead of the literal "မင်းဒီကို ဘာလုပ်ဖို့လာတာလဲ။".
  * Questions must use spoken endings like "လဲ", "လား", "မလို့လဲ", "မလား", "မလို့လား" instead of written "သနည်း", "ပါသလား".
  * Commands/Warnings must use spoken endings like "နဲ့", "ပါနဲ့", "စမ်း", "လိုက်စမ်း" instead of written "မပြုပါနှင့်", "လော့".
`;
            break;
        case 'default_recap':
        default:
            styleInstruction = `
- CRITICAL: Use an engaging, energetic, and highly natural spoken Burmese movie recap narration style. Imagine a professional Burmese narrator explaining the movie's plot directly to a YouTube or TikTok audience.
- Natural Narrative Transitions & Spacing:
  * Use natural conversational transition words instead of heavy bookish connectors.
  * For "Then / After that", use "အဲ့ဒီနောက်...", "အဲ့ဒီနောက်ပိုင်း...", "ပြီးတော့...", "ဒါနဲ့ပဲ...". Do NOT use "ထိုနောက်", "ထို့နောက်".
  * For "But / However", use "ဒါပေမဲ့...", "ဒါပေမဲ့လည်း...", "ဒါပေမယ့်...". Do NOT use "သို့သော်လည်း", "သို့ရာတွင်".
  * For "At that time / Just then", use "အဲဒီအချိန်မှာပဲ...", "အဲ့ဒီအချိန်မှာ...", "အဲ့အချိန်...". Do NOT use "ထိုအချိန်တွင်", "ထိုအခိုက်အတန့်၌".
  * For "Suddenly / Unexpectedly", use "မထင်မှတ်ဘဲ...", "ရုတ်တရက်ကြီး...", "ထင်မထားဘဲ...". Do NOT use "ချက်ချင်းပင်", "ရုတ်ခြည်း".
  * Integrate engaging spoken narration hooks naturally: "ဒီအချိန်မှာတော့...", "သူမထင်ထားတာက...", "အခြေအနေကတော့...", "ဒီလိုနဲ့...", "နောက်ဆုံးမှာတော့...".
- Spoken Sentence Endings:
  * Use lively spoken endings like "တယ်", "မယ်", "ခဲ့တယ်", "ပါပဲ", "တာပေါ့", "နေတာ" instead of written final markers like "သည်", "ပါသည်", "ခဲ့သည်", "အံ့", "လေသည်။".
- Fluid Storytelling: Keep sentences compact, punchy, and highly rhythmic so they are easy for TTS to pronounce and extremely natural when heard by viewers.
`;
            break;
    }

    let naturalnessInstruction = '';
    
    switch (naturalnessLevel) {
        case 'high_colloquial':
            naturalnessInstruction = `
- The goal is NOT to make every sentence rude. The goal is to make each character sound like a real Burmese person in the actual situation.
- You MUST consider: Character personality, Age, Social status, Relationship, Emotional state, Situation, Scene intensity, Humor, Anger, Fear, Surprise, Sadness, Mockery, Threatening tone, and Casual friendship.
- The high_colloquial mode should allow natural everyday Burmese expressions where contextually appropriate.
- Examples of the type of natural spoken style that may be appropriate depending on the scene: "ဒီကောင်", "ဒီကောင်လေး", "ဒီကောင်ကတော့ကွာ", "သူတောင်းစားကောင်", "အေးပါကွာ", "ယဖ", "သားရီး", "အေလေ", "အဲဒါဘာလဲကွ", "မင်းကလည်းကွာ", "ဟေ့", "ဘာလုပ်နေတာလဲ", "အဲ့လိုလား", "တကယ်ကြီးလား", "မဖြစ်ဘူးကွာ".
- IMPORTANT: CONTEXTUAL ROUGHNESS
  * In high_colloquial mode, the system may use stronger or rougher everyday Burmese wording when the scene genuinely requires it.
  * For example: A poor or rough character may speak differently from a wealthy or educated character. An angry character may speak more aggressively. A funny scene may use naturally funny Burmese wording. A mocking scene may use teasing or sarcastic expressions. A sad scene should use emotionally natural Burmese expressions. A frightened scene should sound frightened. A street-level character may use more direct everyday wording.
  * However: Do not add profanity randomly. Do not make every sentence rude. Do not force slang. Do not change the story meaning. Do not invent dialogue that does not exist. Do not change character relationships without evidence. The same character should not randomly change speech style from sentence to sentence unless the emotion or situation changes. Keep the rough, realistic, emotionally expressive language specifically inside high_colloquial.
- IMPORTANT: PRESERVE MOVIE RECAP CONTENT
  * Even when making Burmese more natural: Do not aggressively summarize. Do not remove important story information. Do not invent events. Do not change the plot. Do not remove important dialogue meaning. Do not change who did what. Do not change the emotional meaning.
  * The goal is: Same story + same meaning + much more natural Burmese spoken delivery.
`;
            break;
        case 'formal':
            naturalnessInstruction = `
- Keep the language formal, precise, respectful, and highly professional.
- Use polite spoken endings like "ပါတယ်", "ပါမယ်", "ပါဦးမယ်", "ပါတယ်ရှင်", "ပါတယ်ခင်ဗျာ" to ensure a polite tone.
- Avoid any casual street slang or overly relaxed fillers (do NOT use "သားရီး", "ယဖ", "မင်းကလည်းကွာ", "ဟာကွာ").
- This style is ideal for serious scenes, documentaries, formal/authoritative characters, or serious emotional situations.
`;
            break;
        case 'balanced':
        default:
            naturalnessInstruction = `
- Use natural spoken Burmese suitable for TTS narration, avoiding excessively formal, book-like Burmese unless the scene requires it.
- Keep the language clean, modern, and easily understandable when heard once.
- Always use standard spoken endings like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်" instead of "သည်", "ပါသည်", "ခဲ့သည်".
- Do not use rough language in the normal balanced mode unless naturally appropriate. Keep the language balanced and standard.
`;
            break;
    }

    return `You are an expert professional Burmese translator specializing in movie recap scripts and dialogues.
Translate the provided original movie recap short narration/dialogue transcript into highly natural, fluent spoken Burmese suitable for Edge TTS narration.

CRITICAL TRANSLATION MANDATES:
1. NEVER translate English grammar, word order, or sentence structure directly. Rewrite into natural spoken Burmese phrasing.
2. ABSOLUTELY FORBIDDEN to use written/bookish sentence-ending markers like "သည်", "ပါသည်", "ခဲ့သည်", "အံ့", "လေသည်။". You MUST always use spoken endings like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်", "တာပေါ့", "ပါပဲ", "ပါ" instead.
3. Keep sentences concise, punchy, and highly rhythmic. Long, complex written compound sentences should be split into smaller, natural spoken sentences to ensure they flow perfectly when read by TTS.
4. Do NOT translate passive voice literally (e.g., "He was chased by a dog" -> "သူ ခွေးမောင်းခံရတယ်" or "သူ့ကို ခွေးလိုက်ဆွဲတယ်", NOT "သူသည် ခွေးတစ်ကောင်၏ အမဲလိုက်ခြင်းကို ခံခဲ့ရသည်").
5. Preserve the exact original story meaning, emotional nuance, facts, and character actions. Do NOT aggressively summarize or remove critical information.
6. Do NOT add titles, headings, explanations, notes, translator comments, or labels (such as "ခေါင်းစဉ်", "ဇာတ်လမ်း", "အကျဉ်းချုပ်").
7. Do NOT invent forms of address or descriptions that are not present in the original text (e.g., do not add "လူငယ်", "မြေးလေး", "အဖိုး", "အဖွား", "ကောင်မလေး", "ကောင်လေး" unless explicitly indicated in the text).
8. Ensure sentences are easy for Burmese TTS to pronounce naturally without unnatural pauses or overloaded punctuation.
9. Character names and proper nouns: identify any character names or proper nouns in the original text (even if imperfectly transcribed) and render them as natural Burmese phonetic transliteration (e.g., a name like "John" becomes "ဂျွန်", "Maria" becomes "မာရီယာ") rather than dropping them or leaving them in the original script. Use the SAME transliteration consistently for the same character every time they are mentioned across the entire transcript — do not use different Burmese spellings for the same name in different lines.
10. Translate as faithfully and literally as natural spoken Burmese allows — this is NOT a creative recap rewrite. Do not summarize, do not expand, do not add narrator commentary, dramatic framing, or YouTube/TikTok-style introductions. Keep each translated line's length roughly proportional to the original line — not noticeably shorter or longer. The output will be converted to speech and played over the original video, so it must say what the original text says, naturally in Burmese, nothing more and nothing less.

STYLE GUIDELINES:
${styleInstruction}

NATURALNESS GUIDELINES:
${naturalnessInstruction}

Return only the requested translation output in strictly valid JSON array format.

Input format:
[
  {
    "index": 0,
    "text": "Original sentence 1"
  }
]

Output format MUST be EXACTLY valid JSON, mapping the same indexes:
[
  {
    "index": 0,
    "text": "မြန်မာဘာသာပြန်စာ ၁"
  }
]`;
};


export const getSceneNarrationSystemInstruction = (translationStyle, naturalnessLevel) => {
    let styleInstruction = '';
    
    switch (translationStyle) {
        case 'literal':
            styleInstruction = `- Provide a faithful retelling of the scene that preserves the exact visual meaning and key information, written in grammatically natural spoken Burmese.
- Avoid stiff phrasing. Maintain standard spoken sentence-ending markers like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်".
- Avoid adding extra conversational fillers or slang.
- CRITICAL: Translate as faithfully and literally as possible without embellishment, invented framing, or added narrative fluff.`;
            break;
        case 'dialogue':
            styleInstruction = `- CRITICAL: Incorporate dynamic storytelling as if sharing real-life action.
- Use natural spoken sentence structures and active voice.
- Use engaging narrative elements and questions as hooks.`;
            break;
        case 'default_recap':
        default:
            styleInstruction = `- CRITICAL: Use an engaging, energetic, and highly natural spoken Burmese movie recap narration style. Imagine a professional Burmese narrator explaining the movie's plot directly to a YouTube or TikTok audience.
- Natural Narrative Transitions & Spacing:
  * Use natural conversational transition words instead of heavy bookish connectors.
  * For "Then / After that", use "အဲ့ဒီနောက်...", "အဲ့ဒီနောက်ပိုင်း...", "ပြီးတော့...", "ဒါနဲ့ပဲ...". Do NOT use "ထိုနောက်", "ထို့နောက်".
  * For "But / However", use "ဒါပေမဲ့...", "ဒါပေမဲ့လည်း...", "ဒါပေမယ့်...". Do NOT use "သို့သော်လည်း", "သို့ရာတွင်".
  * Integrate engaging spoken narration hooks naturally.`;
            break;
    }

    let naturalnessInstruction = '';
    
    switch (naturalnessLevel) {
        case 'high_colloquial':
            naturalnessInstruction = `- The high_colloquial mode should allow natural everyday Burmese expressions where contextually appropriate.
- You MUST consider: Situation, Scene intensity, Humor, Anger, Fear, Surprise.
- The same story should not randomly change speech style. Keep the rough, realistic, emotionally expressive language specifically inside high_colloquial.`;
            break;
        case 'formal':
            naturalnessInstruction = `- Keep the language formal, precise, respectful, and highly professional.
- Use polite spoken endings like "ပါတယ်", "ပါမယ်" to ensure a polite tone.
- Avoid any casual street slang.`;
            break;
        case 'balanced':
        default:
            naturalnessInstruction = `- Use natural spoken Burmese suitable for TTS narration, avoiding excessively formal, book-like Burmese unless the scene requires it.
- Keep the language clean, modern, and easily understandable when heard once.
- Always use standard spoken endings like "တယ်", "မယ်", "ခဲ့တယ်", "နေတယ်".`;
            break;
    }

    return `You are an expert Burmese movie-recap narrator. You will be given a list of movie scenes in chronological order, each with a scene index, start time, end time, and visual/contextual description (or video frame data) for that scene.

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
${styleInstruction}

NATURALNESS GUIDELINES:
${naturalnessInstruction}

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no explanation:
[
  {"scene": 1, "narration": "..."},
  {"scene": 2, "narration": "..."}
]

The array length MUST exactly match the number of input scenes, one entry per scene, in the same order.`;
};
