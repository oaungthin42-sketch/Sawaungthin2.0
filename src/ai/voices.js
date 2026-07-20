export const VOICES = [
    {
        id: 'male-young',
        name: 'တက်ကြွသောလူငယ်အသံ',
        gender: 'male',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '+4Hz',
        rate: '+45%'
    },
    {
        id: 'male-young-adult',
        name: 'လူငယ်အမျိုးသားအသံ',
        gender: 'male',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '+0Hz',
        rate: '+38%'
    },
    {
        id: 'male-calm',
        name: 'အေးဆေးတည်ငြိမ်အသံ',
        gender: 'male',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-2Hz',
        rate: '+28%'
    },
    {
        id: 'male-mature',
        name: 'လူလတ်ပိုင်းအမျိုးသားအသံ',
        gender: 'male',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-4Hz',
        rate: '+35%'
    },
    {
        id: 'male-deep',
        name: 'နက်ရှိုင်းသောအမျိုးသားအသံ',
        gender: 'male',
        edgeVoice: 'my-MM-ThihaNeural',
        pitch: '-8Hz',
        rate: '+30%'
    },
    {
        id: 'female-young',
        name: 'လူငယ်မိန်းကလေးအသံ',
        gender: 'female',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '+6Hz',
        rate: '+45%'
    },
    {
        id: 'female-default',
        name: 'တည်ငြိမ်သောမိန်းကလေးအသံ',
        gender: 'female',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '+0Hz',
        rate: '+35%'
    },
    {
        id: 'female-soft',
        name: 'နူးညံ့သောမိန်းကလေးအသံ',
        gender: 'female',
        edgeVoice: 'my-MM-NilarNeural',
        pitch: '-2Hz',
        rate: '+25%'
    }
];

export const getVoiceConfig = (id) => {
    return VOICES.find(v => v.id === id) || VOICES.find(v => v.id === 'male-young-adult');
};
