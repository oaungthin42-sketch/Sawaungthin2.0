import fs from 'fs';

const content = `import React, { useState } from 'react';
import { Key, Eye, EyeOff, Save, XCircle, Trash, Mic, Loader2, Play, Settings2, Sliders, Settings, Volume2, Video, Terminal, ChevronDown, ChevronUp } from 'lucide-react';

interface SettingsModalProps {
    showSettings: boolean;
    setShowSettings: (val: boolean) => void;
    settings: any;
    editSettings: any;
    setEditSettings: (val: any) => void;
    saveSetting: (key: string, value: string) => void;
    deleteSetting: (key: string) => void;
    settingsSaving: boolean;
    voices: any[];
    previewingVoice: string | null;
    handlePreviewVoice: (voiceId: string) => void;
    showKeys: Record<string, boolean>;
    setShowKeys: (val: Record<string, boolean>) => void;
}

export function SettingsModal({
    showSettings, setShowSettings,
    settings, editSettings, setEditSettings,
    saveSetting, deleteSetting, settingsSaving,
    voices, previewingVoice, handlePreviewVoice,
    showKeys, setShowKeys
}: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<'voice' | 'system'>('voice');
    const [expandedVoice, setExpandedVoice] = useState<'male' | 'female'>('male');

    if (!showSettings) return null;
    
    const renderSelect = (id: string, label: string, options: {value: string, label: string}[], description?: string, disabled: boolean = false) => {
        const value = settings[id]?.value || options[0].value;
        return (
            <div key={id} className="p-4 rounded-xl bg-gray-950/50 border border-gray-800/50 h-full">
                <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
                {description && <p className="text-xs text-gray-500 mb-3">{description}</p>}
                <select
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                    value={value}
                    onChange={(e) => saveSetting(id, e.target.value)}
                    disabled={settingsSaving || disabled}
                >
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
        );
    };

    const renderRadioGroup = (id: string, label: string, options: {value: string, label: string, desc: string}[]) => {
        const currentValue = settings[id]?.value || options[0].value;
        return (
            <div key={id} className="p-4 rounded-xl bg-gray-950/50 border border-gray-800/50">
                <label className="block text-sm font-medium text-gray-300 mb-3">{label}</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {options.map(opt => {
                        const isActive = currentValue === opt.value;
                        return (
                            <div 
                                key={opt.value} 
                                onClick={() => !settingsSaving && saveSetting(id, opt.value)}
                                className={\`p-3 rounded-lg border cursor-pointer transition-colors \${isActive ? 'bg-indigo-900/40 border-indigo-500/50' : 'bg-gray-900 border-gray-700 hover:border-gray-600'} \${settingsSaving ? 'opacity-50 cursor-not-allowed' : ''}\`}
                            >
                                <div className={\`text-sm font-medium \${isActive ? 'text-indigo-300' : 'text-gray-300'}\`}>{opt.label}</div>
                                <div className="text-xs text-gray-500 mt-1">{opt.desc}</div>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl mb-8 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                    <Settings className="w-6 h-6 text-indigo-400" />
                    Configuration
                </h2>
                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white transition-colors p-2">
                    <XCircle className="w-6 h-6" />
                </button>
            </div>

            <div className="flex gap-2 mb-6 border-b border-gray-800 shrink-0">
                <button 
                    onClick={() => setActiveTab('voice')}
                    className={\`px-4 py-2 font-medium text-sm transition-colors border-b-2 \${activeTab === 'voice' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-300'}\`}
                >
                    အသံနှင့် ဘာသာပြန်
                </button>
                <button 
                    onClick={() => setActiveTab('system')}
                    className={\`px-4 py-2 font-medium text-sm transition-colors border-b-2 \${activeTab === 'system' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-300'}\`}
                >
                    စနစ်ဆက်တင်များ
                </button>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1 pr-2 space-y-6 pb-4">
                {activeTab === 'voice' && (
                    <>
                        <section>
                            {renderRadioGroup('TRANSLATION_STYLE', 'ဘာသာပြန်ပုံစံ', [
                                { value: 'default_recap', label: 'Movie Recap', desc: 'ဇာတ်လမ်းပြောပုံစံ' },
                                { value: 'literal', label: 'မူရင်းအတိုင်း', desc: 'မူရင်းအဓိပ္ပာယ်ကို ထိန်း' },
                                { value: 'dialogue', label: 'သူတစ်ပြန် ကိုယ်တစ်ပြန်', desc: 'စကားပြောဇာတ်ဝင်ခန်း' }
                            ])}
                        </section>

                        <section>
                            {renderRadioGroup('BURMESE_NATURALNESS', 'မြန်မာစကားပုံစံ', [
                                { value: 'balanced', label: 'သဘာဝကျ', desc: 'ပုံမှန် Movie Recap အတွက်' },
                                { value: 'formal', label: 'ယဉ်ကျေး', desc: 'ရှင်းပြီး အေးဆေး' },
                                { value: 'high_colloquial', label: 'လက်သုံးစကား', desc: 'သူငယ်ချင်းလို ပြော' }
                            ])}
                        </section>

                        <section className="p-4 rounded-xl bg-gray-950/50 border border-gray-800/50">
                            <label className="block text-sm font-medium text-gray-300 mb-4">မြန်မာအသံ</label>
                            <div className="space-y-3">
                                {/* Male Voices */}
                                <div className="border border-gray-800 rounded-lg bg-gray-900 overflow-hidden">
                                    <button 
                                        onClick={() => setExpandedVoice(expandedVoice === 'male' ? 'female' : 'male')}
                                        className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
                                    >
                                        အမျိုးသားအသံ
                                        {expandedVoice === 'male' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    {expandedVoice === 'male' && (
                                        <div className="p-3 pt-0 grid grid-cols-1 md:grid-cols-2 gap-2 border-t border-gray-800 mt-2 pt-2">
                                            {voices.filter(v => v.gender === 'male').map(v => (
                                                <div 
                                                    key={v.id} 
                                                    className={\`flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer \${settings['EDGE_TTS_VOICE']?.value === v.id || (!settings['EDGE_TTS_VOICE']?.value && v.id === 'male-young-adult') ? 'bg-indigo-900/30 border-indigo-500/50 text-white' : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'}\`}
                                                    onClick={() => !settingsSaving && saveSetting('EDGE_TTS_VOICE', v.id)}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className={\`w-2.5 h-2.5 rounded-full \${settings['EDGE_TTS_VOICE']?.value === v.id || (!settings['EDGE_TTS_VOICE']?.value && v.id === 'male-young-adult') ? 'bg-indigo-500' : 'bg-gray-700'}\`} />
                                                        <span className="text-sm">{v.name}</span>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.id); }}
                                                        disabled={previewingVoice !== null}
                                                        className={\`flex items-center gap-1.5 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs transition-colors \${previewingVoice === v.id ? 'text-indigo-400' : 'text-gray-400'}\`}
                                                    >
                                                        {previewingVoice === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Female Voices */}
                                <div className="border border-gray-800 rounded-lg bg-gray-900 overflow-hidden">
                                    <button 
                                        onClick={() => setExpandedVoice(expandedVoice === 'female' ? 'male' : 'female')}
                                        className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
                                    >
                                        အမျိုးသမီးအသံ
                                        {expandedVoice === 'female' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    {expandedVoice === 'female' && (
                                        <div className="p-3 pt-0 grid grid-cols-1 md:grid-cols-2 gap-2 border-t border-gray-800 mt-2 pt-2">
                                            {voices.filter(v => v.gender === 'female').map(v => (
                                                <div 
                                                    key={v.id} 
                                                    className={\`flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer \${settings['EDGE_TTS_VOICE']?.value === v.id ? 'bg-indigo-900/30 border-indigo-500/50 text-white' : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'}\`}
                                                    onClick={() => !settingsSaving && saveSetting('EDGE_TTS_VOICE', v.id)}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className={\`w-2.5 h-2.5 rounded-full \${settings['EDGE_TTS_VOICE']?.value === v.id ? 'bg-indigo-500' : 'bg-gray-700'}\`} />
                                                        <span className="text-sm">{v.name}</span>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.id); }}
                                                        disabled={previewingVoice !== null}
                                                        className={\`flex items-center gap-1.5 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs transition-colors \${previewingVoice === v.id ? 'text-indigo-400' : 'text-gray-400'}\`}
                                                    >
                                                        {previewingVoice === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        <section className="grid md:grid-cols-2 gap-4">
                            {renderSelect('VOICE_SPEED', 'အသံမြန်နှုန်း', [
                                { value: 'default', label: 'Default' }
                            ], 'မြန် / နှေး', true)}
                            {renderSelect('VOICE_PITCH', 'အသံအတက်အကျ', [
                                { value: 'default', label: 'Default' }
                            ], 'အသံအမြင့် / အနိမ့်', true)}
                        </section>
                    </>
                )}

                {activeTab === 'system' && (
                    <>
                        <section className="grid md:grid-cols-2 gap-4">
                            {renderSelect('AUDIO_LOUDNESS', 'အသံအရည်အသွေး', [
                                { value: 'default', label: 'Default' }
                            ], undefined, true)}
                            {renderSelect('SYNC_MODE', 'Scene Sync', [
                                { value: 'default', label: 'Default' }
                            ], undefined, true)}
                        </section>

                        <section>
                            <h3 className="text-sm font-medium text-gray-300 mb-3 ml-1">Gemini AI</h3>
                            <div className="space-y-3">
                                {[
                                    { id: 'ASSEMBLYAI_API_KEY', label: 'AssemblyAI API Key', isSecret: true },
                                    { id: 'GEMINI_API_KEY', label: 'Gemini API Key', isSecret: true },
                                ].map(field => {
                                    const isConfigured = settings[field.id]?.configured;
                                    const isEditing = editSettings[field.id] !== undefined;
                                    const editValue = editSettings[field.id] || '';

                                    return (
                                        <div key={field.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-gray-950/50 border border-gray-800/50">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-1">{field.label}</label>
                                                <div className="flex items-center gap-2">
                                                    <div className={\`w-2 h-2 rounded-full \${isConfigured ? 'bg-emerald-500' : 'bg-amber-500'}\`} />
                                                    <span className="text-xs text-gray-500">{isConfigured ? 'Configured' : 'Missing'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 w-full md:w-auto">
                                                {isEditing ? (
                                                    <>
                                                        <div className="relative flex-1 md:w-64">
                                                            <input
                                                                type={field.isSecret && !showKeys[field.id] ? 'password' : 'text'}
                                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 pr-10 transition-colors"
                                                                value={editValue}
                                                                onChange={e => setEditSettings({ ...editSettings, [field.id]: e.target.value })}
                                                                placeholder={\`Enter \${field.label}...\`}
                                                                autoFocus
                                                            />
                                                            {field.isSecret && (
                                                                <button
                                                                    onClick={() => setShowKeys({ ...showKeys, [field.id]: !showKeys[field.id] })}
                                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                                                >
                                                                    {showKeys[field.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                                </button>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => saveSetting(field.id, editValue)}
                                                            disabled={settingsSaving}
                                                            className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white disabled:opacity-50 transition-colors"
                                                        >
                                                            <Save className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditSettings({ ...editSettings, [field.id]: undefined })}
                                                            disabled={settingsSaving}
                                                            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white disabled:opacity-50 transition-colors"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => setEditSettings({ ...editSettings, [field.id]: '' })}
                                                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm font-medium rounded-lg text-white transition-colors"
                                                        >
                                                            {isConfigured ? 'Replace' : 'Configure'}
                                                        </button>
                                                        {isConfigured && (
                                                            <button
                                                                onClick={() => deleteSetting(field.id)}
                                                                disabled={settingsSaving}
                                                                className="p-2 bg-red-950/30 hover:bg-red-900/50 border border-red-900/50 rounded-lg text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                                                            >
                                                                <Trash className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section>
                            <h3 className="text-sm font-medium text-gray-300 mb-3 ml-1">Advanced</h3>
                            <div className="p-4 rounded-xl bg-gray-950/50 border border-gray-800/50">
                                <p className="text-sm text-gray-500">
                                    Advanced technical configuration locked to stable baselines.
                                </p>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
`;
fs.writeFileSync('src/components/SettingsModal.tsx', content);
console.log("Updated SettingsModal.tsx with tabs and shorter texts");
