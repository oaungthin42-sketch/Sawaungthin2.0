import fs from 'fs';

const content = `import React from 'react';
import { Key, Eye, EyeOff, Save, XCircle, Trash, Mic, Loader2, Play, Settings2, Sliders, Settings, Volume2, Video, Terminal } from 'lucide-react';

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
    
    if (!showSettings) return null;
    
    const renderSelect = (id: string, label: string, options: {value: string, label: string}[], description?: string, disabled: boolean = false) => {
        const value = settings[id]?.value || options[0].value;
        return (
            <div key={id} className="p-4 rounded-xl bg-gray-950/50 border border-gray-800/50">
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

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl mb-8 space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-gray-900 py-2 z-10 border-b border-gray-800">
                <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                    <Settings className="w-6 h-6 text-indigo-400" />
                    Configuration
                </h2>
                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white transition-colors p-2">
                    <XCircle className="w-6 h-6" />
                </button>
            </div>

            {/* TRANSLATION SETTINGS */}
            <section>
                <div className="flex items-center gap-2 mb-4 text-indigo-300 border-b border-gray-800 pb-2">
                    <Settings2 className="w-5 h-5" />
                    <h3 className="text-lg font-medium">Translation Settings</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    {renderSelect('TRANSLATION_STYLE', 'Translation Style', [
                        { value: 'default_recap', label: 'Default Recap (Narrative)' },
                        { value: 'dialogue', label: 'Natural Burmese Dialogue' },
                        { value: 'literal', label: 'Literal Translation' }
                    ], "Selects the overarching style of the translated Burmese text.")}
                    
                    {renderSelect('BURMESE_NATURALNESS', 'Burmese Naturalness', [
                        { value: 'balanced', label: 'Balanced (Standard TTS)' },
                        { value: 'high_colloquial', label: 'High Colloquial (Slang / Casual)' },
                        { value: 'formal', label: 'Formal (Documentary)' }
                    ], "Controls how conversational or formal the Burmese language should be.")}
                </div>
            </section>

            {/* TTS / VOICE SETTINGS */}
            <section>
                <div className="flex items-center gap-2 mb-4 text-indigo-300 border-b border-gray-800 pb-2">
                    <Mic className="w-5 h-5" />
                    <h3 className="text-lg font-medium">TTS & Voice Settings</h3>
                </div>
                
                <div className="p-4 rounded-xl bg-gray-950/50 border border-gray-800/50 mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-4">Burmese Narration Voice</label>
                    <div className="space-y-6">
                        {/* Male Voices */}
                        <div>
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Male / Boy Voices (အမျိုးသားအသံများ)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {voices.filter(v => v.gender === 'male').map(v => (
                                    <div 
                                        key={v.id} 
                                        className={\`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer \${settings['EDGE_TTS_VOICE']?.value === v.id || (!settings['EDGE_TTS_VOICE']?.value && v.id === 'male-young-adult') ? 'bg-indigo-900/30 border-indigo-500/50 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'}\`}
                                        onClick={() => saveSetting('EDGE_TTS_VOICE', v.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={\`w-3 h-3 rounded-full \${settings['EDGE_TTS_VOICE']?.value === v.id || (!settings['EDGE_TTS_VOICE']?.value && v.id === 'male-young-adult') ? 'bg-indigo-500' : 'bg-gray-700'}\`} />
                                            <span className="font-medium text-sm">{v.name}</span>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.id); }}
                                            disabled={previewingVoice !== null}
                                            className={\`flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs transition-colors \${previewingVoice === v.id ? 'text-indigo-400' : 'text-gray-300'}\`}
                                        >
                                            {previewingVoice === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                            Preview
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {/* Female Voices */}
                        <div>
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Female / Girl Voices (အမျိုးသမီးအသံများ)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {voices.filter(v => v.gender === 'female').map(v => (
                                    <div 
                                        key={v.id} 
                                        className={\`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer \${settings['EDGE_TTS_VOICE']?.value === v.id ? 'bg-indigo-900/30 border-indigo-500/50 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'}\`}
                                        onClick={() => saveSetting('EDGE_TTS_VOICE', v.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={\`w-3 h-3 rounded-full \${settings['EDGE_TTS_VOICE']?.value === v.id ? 'bg-indigo-500' : 'bg-gray-700'}\`} />
                                            <span className="font-medium text-sm">{v.name}</span>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.id); }}
                                            disabled={previewingVoice !== null}
                                            className={\`flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs transition-colors \${previewingVoice === v.id ? 'text-indigo-400' : 'text-gray-300'}\`}
                                        >
                                            {previewingVoice === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                            Preview
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    {renderSelect('VOICE_SPEED', 'Voice Speed', [
                        { value: 'default', label: 'Stable Baseline (Default)' }
                    ], "Maintains existing safe voice generation speeds.", true)}
                    {renderSelect('VOICE_PITCH', 'Voice Pitch', [
                        { value: 'default', label: 'Stable Baseline (Default)' }
                    ], "Maintains existing safe voice pitch configurations.", true)}
                </div>
            </section>

            {/* AUDIO SETTINGS */}
            <section>
                <div className="flex items-center gap-2 mb-4 text-indigo-300 border-b border-gray-800 pb-2">
                    <Volume2 className="w-5 h-5" />
                    <h3 className="text-lg font-medium">Audio Settings</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    {renderSelect('AUDIO_LOUDNESS', 'Loudness Normalization', [
                        { value: 'default', label: 'Stable Baseline (Default)' }
                    ], "Current audio loudness normalization behavior.", true)}
                </div>
            </section>

            {/* VIDEO / SCENE SYNCHRONIZATION SETTINGS */}
            <section>
                <div className="flex items-center gap-2 mb-4 text-indigo-300 border-b border-gray-800 pb-2">
                    <Video className="w-5 h-5" />
                    <h3 className="text-lg font-medium">Video / Scene Synchronization Settings</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    {renderSelect('SYNC_MODE', 'Synchronization Mode', [
                        { value: 'default', label: 'Stable Authoritative Timeline (Default)' }
                    ], "Uses the established scene start/end mapping logic.", true)}
                </div>
            </section>

            {/* AI / GEMINI SETTINGS */}
            <section>
                <div className="flex items-center gap-2 mb-4 text-indigo-300 border-b border-gray-800 pb-2">
                    <Key className="w-5 h-5" />
                    <h3 className="text-lg font-medium">AI / Gemini Settings</h3>
                </div>
                <div className="space-y-4">
                    {[
                        { id: 'ASSEMBLYAI_API_KEY', label: 'AssemblyAI API Key', isSecret: true },
                        { id: 'GEMINI_API_KEY', label: 'Gemini API Key', isSecret: true },
                    ].map(field => {
                        const isConfigured = settings[field.id]?.configured;
                        const displayValue = settings[field.id]?.masked || settings[field.id]?.value || '';
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

            {/* ADVANCED SETTINGS */}
            <section>
                <div className="flex items-center gap-2 mb-4 text-indigo-300 border-b border-gray-800 pb-2">
                    <Terminal className="w-5 h-5" />
                    <h3 className="text-lg font-medium">Advanced Settings</h3>
                </div>
                <div className="p-4 rounded-xl bg-gray-950/50 border border-gray-800/50">
                    <p className="text-sm text-gray-400">
                        Advanced configuration (FFmpeg rendering behavior, semantic mapping, and drift limits) are currently locked to their stable, tested baselines.
                    </p>
                </div>
            </section>
        </div>
    );
}
`;

fs.writeFileSync('src/components/SettingsModal.tsx', content);
console.log("Updated SettingsModal.tsx");
