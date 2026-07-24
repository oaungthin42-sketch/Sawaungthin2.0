const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');

const anchor = `<div className="space-y-4">
                            {[
                                { id: 'GEMINI_API_KEY', label: 'Gemini API Key', placeholder: 'Enter Gemini API Key...' },
                            ].map(field => {`;
const insert = `
                        {/* Output Speed Section */}
                        <div className="p-4 rounded-xl bg-gray-900/40 border border-gray-800/60 flex flex-col gap-3">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-sm font-semibold text-gray-300">ရလဒ်ဗီဒီယို အသံနှုန်း (Output Speed)</span>
                                <span className="text-xs text-gray-500 font-medium">ထုတ်လုပ်ပြီးသား ဗီဒီယိုတစ်ခုလုံးရဲ့ ပြေးနှုန်းကို ချိန်ညှိပါ — video နဲ့ အသံ နှစ်ခုစလုံး တညီတည်း မြန်/နှေး သွားမှာဖြစ်ပါတယ်။</span>
                            </div>
                            <div className="relative">
                                <select 
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 appearance-none"
                                    value={settings['OUTPUT_SPEED_MULTIPLIER']?.value || "1.0"}
                                    onChange={(e) => saveSetting('OUTPUT_SPEED_MULTIPLIER', e.target.value)}
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
`;
content = content.replace('<div className="space-y-4">', insert + '\n                        <div className="space-y-4">');
fs.writeFileSync('src/components/SettingsModal.tsx', content, 'utf8');
console.log('patched SettingsModal.tsx');
