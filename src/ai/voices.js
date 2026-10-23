export const VOICES = [
    {
        id: 'male-young',
        name: 'တက်ကြွသောလူငယ်အသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '+0Hz',
        rate: '+34%'
    },
    {
        id: 'male-young-adult',
        name: 'လူငယ်အမျိုးသားအသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '+2Hz',
        rate: '+35%'
    },
    {
        id: 'male-calm',
        name: 'အေးဆေးတည်ငြိမ်အသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-2Hz',
        rate: '+33%'
    },
    {
        id: 'male-mature',
        name: 'လူလတ်ပိုင်းအမျိုးသားအသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-6Hz',
        rate: '+34%'
    },
    {
        id: 'male-deep',
        name: 'နက်ရှိုင်းသောအမျိုးသားအသံ',
        gender: 'male',
        lang: 'my',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-10Hz',
        rate: '+33%'
    },
    {
        id: 'female-young',
        name: 'လူငယ်မိန်းကလေးအသံ',
        gender: 'female',
        lang: 'my',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '+6Hz',
        rate: '+38%'
    },
    {
        id: 'female-default',
        name: 'တည်ငြိမ်သောမိန်းကလေးအသံ',
        gender: 'female',
        lang: 'my',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '+0Hz',
        rate: '+35%'
    },
    {
        id: 'female-soft',
        name: 'နူးညံ့သောမိန်းကလေးအသံ',
        gender: 'female',
        lang: 'my',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '-2Hz',
        rate: '+33%'
    },
    {
        id: 'th-male-default',
        name: 'ထိုင်း - အမျိုးသားအသံ (ပုံမှန်)',
        gender: 'male',
        lang: 'th',
        edgeVoice: 'th-TH-NiwatNeural',
        pitch: '+0Hz',
        rate: '+15%'
    },
    {
        id: 'th-male-young',
        name: 'ထိုင်း - လူငယ်အမျိုးသားအသံ',
        gender: 'male',
        lang: 'th',
        edgeVoice: 'th-TH-NiwatNeural',
        pitch: '+3Hz',
        rate: '+18%'
    },
    {
        id: 'th-male-deep',
        name: 'ထိုင်း - နက်ရှိုင်းသောအမျိုးသားအသံ',
        gender: 'male',
        lang: 'th',
        edgeVoice: 'th-TH-NiwatNeural',
        pitch: '-6Hz',
        rate: '+12%'
    },
    {
        id: 'th-female-default',
        name: 'ထိုင်း - အမျိုးသမီးအသံ (ပုံမှန်)',
        gender: 'female',
        lang: 'th',
        edgeVoice: 'th-TH-PremwadeeNeural',
        pitch: '+0Hz',
        rate: '+15%'
    },
    {
        id: 'th-female-young',
        name: 'ထိုင်း - လူငယ်မိန်းကလေးအသံ',
        gender: 'female',
        lang: 'th',
        edgeVoice: 'th-TH-PremwadeeNeural',
        pitch: '+4Hz',
        rate: '+18%'
    },
    {
        id: 'th-female-soft',
        name: 'ထိုင်း - နူးညံ့သောမိန်းကလေးအသံ',
        gender: 'female',
        lang: 'th',
        edgeVoice: 'th-TH-PremwadeeNeural',
        pitch: '-2Hz',
        rate: '+12%'
    }
];

export const getVoiceConfig = (id) => {
    return VOICES.find(v => v.id === id) || VOICES.find(v => v.id === 'male-young-adult');
};

export const getDefaultVoiceId = (lang) => (lang === 'th' ? 'th-male-default' : 'male-young-adult');
