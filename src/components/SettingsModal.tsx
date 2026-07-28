import { XCircle, Settings } from 'lucide-react';

interface SettingsModalProps {
    showSettings: boolean;
    setShowSettings: (val: boolean) => void;
    settings: any;
    editSettings: any;
    setEditSettings: (val: any) => void;
    saveSetting: (key: string, value: string) => void;
    deleteSetting: (key: string) => void;
    settingsSaving: boolean;
    showKeys: Record<string, boolean>;
    setShowKeys: (val: Record<string, boolean>) => void;
}

export function SettingsModal({
    showSettings, setShowSettings,
    settings, editSettings, setEditSettings,
    saveSetting
}: SettingsModalProps) {

    if (!showSettings) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300">
            <div className="bg-gray-950 border border-gray-800/80 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-5 border-b border-gray-800/50">
                    <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-indigo-400" />
                        Playback Preferences
                    </h2>
                    <button 
                        onClick={() => setShowSettings(false)} 
                        className="text-gray-400 hover:text-white hover:scale-110 active:scale-95 transition-all p-1"
                    >
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto p-6 space-y-6 flex-1 custom-scrollbar">
                    <div className="space-y-5">
                        {/* Output Speed Section */}
                        <div className="p-4 rounded-xl bg-gray-900/40 border border-gray-800/60 flex flex-col gap-3">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-sm font-semibold text-gray-300">ရလဒ်ဗီဒီယို အသံနှုန်း (Output Speed)</span>
                                <span className="text-xs text-gray-500 font-medium">ထုတ်လုပ်ပြီးသား ဗီဒီယိုတစ်ခုလုံးရဲ့ ပြေးနှုန်းကို ချိန်ညှိပါ — video နဲ့ အသံ နှစ်ခုစလုံး တညီတည်း မြန်/နှေး သွားမှာဖြစ်ပါတယ်။</span>
                            </div>
                            <div className="relative">
                                <select 
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 appearance-none"
                                    value={editSettings['OUTPUT_SPEED_MULTIPLIER'] !== undefined ? editSettings['OUTPUT_SPEED_MULTIPLIER'] : (settings['OUTPUT_SPEED_MULTIPLIER']?.value || "1.0")}
                                    onChange={(e) => {
                                        setEditSettings({ ...editSettings, 'OUTPUT_SPEED_MULTIPLIER': e.target.value });
                                        saveSetting('OUTPUT_SPEED_MULTIPLIER', e.target.value);
                                    }}
                                >
                                    <option value="1.0">1x (Default)</option>
                                    <option value="1.25">1.25x</option>
                                    <option value="1.5">1.5x</option>
                                    <option value="1.75">1.75x</option>
                                    <option value="2.0">2x</option>
                                    <option value="2.5">2.5x</option>
                                    <option value="3.0">3x</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-gray-900/20 border border-gray-800/40 text-center">
                            <span className="text-xs text-gray-500 font-medium">အဆင့်မြင့် စနစ်လုပ်ဆောင်ချက်များကို auto-optimize စနစ်ဖြင့် အကောင်းဆုံး ပြင်ဆင်ပေးထားပြီးဖြစ်ပါသည်။</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-900/30 border-t border-gray-800/50 flex justify-end">
                    <button
                        onClick={() => setShowSettings(false)}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 hover:scale-102"
                    >
                        အိုကေ (Confirm)
                    </button>
                </div>
            </div>
        </div>
    );
}
