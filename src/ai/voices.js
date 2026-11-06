import { getSetting } from '../services/settings.js';

export const VOICES = [
    {
        id: 'ms-thiha-original',
        name: 'Microsoft သီဟ (မူရင်းအသံ)',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '+0Hz',
        rate: '+0%'
    },
    {
        id: 'ms-nilar-original',
        name: 'Microsoft နီလာ (မူရင်းအသံ)',
        gender: 'female',
        lang: 'my',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '+0Hz',
        rate: '+0%'
    },
    {
        id: 'ms-william-multilingual',
        name: 'Microsoft ဝီလျံ (စကားစုံ)',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'en-AU-WilliamMultilingualNeural',
        pitch: '+0Hz',
        rate: '+0%'
    },
    {
        id: 'ms-giuseppe-multilingual',
        name: 'Microsoft ဂျူဇက်ပီ (စကားစုံ)',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'it-IT-GiuseppeMultilingualNeural',
        pitch: '+0Hz',
        rate: '+0%'
    },
    {
        id: 'ms-hyunsu-multilingual',
        name: 'Microsoft ဟွန်ဆူး (စကားစုံ)',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'ko-KR-HyunsuMultilingualNeural',
        pitch: '+0Hz',
        rate: '+0%'
    },
    {
        id: 'male-young',
        name: 'တက်ကြွသောလူငယ်အသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '+0Hz',
        rate: '+45%'
    },
    {
        id: 'male-young-adult',
        name: 'လူငယ်အမျိုးသားအသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '+2Hz',
        rate: '+45%'
    },
    {
        id: 'male-calm',
        name: 'အေးဆေးတည်ငြိမ်အသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-2Hz',
        rate: '+45%'
    },
    {
        id: 'male-mature',
        name: 'လူလတ်ပိုင်းအမျိုးသားအသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-6Hz',
        rate: '+45%'
    },
    {
        id: 'male-deep',
        name: 'နက်ရှိုင်းသောအမျိုးသားအသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-10Hz',
        rate: '+45%'
    },
    {
        id: 'female-young',
        name: 'လူငယ်မိန်းကလေးအသံ',
        gender: 'female',
        lang: 'my',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '+6Hz',
        rate: '+45%'
    },
    {
        id: 'female-default',
        name: 'တည်ငြိမ်သောမိန်းကလေးအသံ',
        gender: 'female',
        lang: 'my',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '+0Hz',
        rate: '+45%'
    },
    {
        id: 'female-soft',
        name: 'နူးညံ့သောမိန်းကလေးအသံ',
        gender: 'female',
        lang: 'my',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '-2Hz',
        rate: '+45%'
    },
    {
        id: 'th-male-default',
        name: 'ထိုင်း - အမျိုးသားအသံ (ပုံမှန်)',
        gender: 'male',
        lang: 'th',
        edgeVoice: 'th-TH-NiwatNeural',
        pitch: '+0Hz',
        rate: '+45%'
    },
    {
        id: 'th-male-young',
        name: 'ထိုင်း - လူငယ်အမျိုးသားအသံ',
        gender: 'male',
        lang: 'th',
        edgeVoice: 'th-TH-NiwatNeural',
        pitch: '+3Hz',
        rate: '+45%'
    },
    {
        id: 'th-male-deep',
        name: 'ထိုင်း - နက်ရှိုင်းသောအမျိုးသားအသံ',
        gender: 'male',
        lang: 'th',
        edgeVoice: 'th-TH-NiwatNeural',
        pitch: '-6Hz',
        rate: '+45%'
    },
    {
        id: 'th-female-default',
        name: 'ထိုင်း - အမျိုးသမီးအသံ (ပုံမှန်)',
        gender: 'female',
        lang: 'th',
        edgeVoice: 'th-TH-PremwadeeNeural',
        pitch: '+0Hz',
        rate: '+45%'
    },
    {
        id: 'th-female-young',
        name: 'ထိုင်း - လူငယ်မိန်းကလေးအသံ',
        gender: 'female',
        lang: 'th',
        edgeVoice: 'th-TH-PremwadeeNeural',
        pitch: '+4Hz',
        rate: '+45%'
    },
    {
        id: 'th-female-soft',
        name: 'ထိုင်း - နူးညံ့သောမိန်းကလေးအသံ',
        gender: 'female',
        lang: 'th',
        edgeVoice: 'th-TH-PremwadeeNeural',
        pitch: '-2Hz',
        rate: '+45%'
    }
];

export const getVoiceConfig = (id) => {
    return VOICES.find(v => v.id === id) || VOICES.find(v => v.id === 'male-young-adult');
};

export const getDefaultVoiceId = (lang) => (lang === 'th' ? 'th-male-default' : 'male-young-adult');

export const parseTuningValue = (rate, pitch) => {
    let r = Math.round(Number(rate));
    let p = Math.round(Number(pitch));
    if (Object.is(r, -0)) r = 0;
    if (Object.is(p, -0)) p = 0;
    const clampedRate = Math.min(Math.max(Number.isFinite(r) ? r : 0, -50), 100);
    const clampedPitch = Math.min(Math.max(Number.isFinite(p) ? p : 0, -50), 50);
    return {
        rate: clampedRate >= 0 ? `+${clampedRate}%` : `${clampedRate}%`,
        pitch: clampedPitch >= 0 ? `+${clampedPitch}Hz` : `${clampedPitch}Hz`,
        rateNum: clampedRate,
        pitchNum: clampedPitch
    };
};

export const getEffectiveVoiceConfig = (voiceId) => {
    const baseConfig = getVoiceConfig(voiceId);
    if (!baseConfig) return null;
    const config = { ...baseConfig };

    try {
        const tuningRaw = getSetting('VOICE_TUNING');
        if (tuningRaw) {
            const parsed = typeof tuningRaw === 'string' ? JSON.parse(tuningRaw) : tuningRaw;
            if (parsed && typeof parsed === 'object' && parsed[config.id]) {
                const override = parsed[config.id];
                if (override && typeof override === 'object') {
                    const hasRate = override.rate !== undefined && override.rate !== null && Number.isFinite(Number(override.rate));
                    const hasPitch = override.pitch !== undefined && override.pitch !== null && Number.isFinite(Number(override.pitch));

                    if (hasRate || hasPitch) {
                        const defaultRateMatch = config.rate.match(/([+-]?\d+)/);
                        const defaultPitchMatch = config.pitch.match(/([+-]?\d+)/);
                        const defaultRateNum = defaultRateMatch ? parseInt(defaultRateMatch[1], 10) : 0;
                        const defaultPitchNum = defaultPitchMatch ? parseInt(defaultPitchMatch[1], 10) : 0;

                        const rNum = hasRate ? Number(override.rate) : defaultRateNum;
                        const pNum = hasPitch ? Number(override.pitch) : defaultPitchNum;

                        const tuned = parseTuningValue(rNum, pNum);
                        config.rate = tuned.rate;
                        config.pitch = tuned.pitch;
                    }
                }
            }
        }
    } catch (e) {
        // Return default config on any parse or unexpected error
    }

    return config;
};
