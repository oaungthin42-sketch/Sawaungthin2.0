const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');

const regex = /<select \s*className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 appearance-none"\s*value=\{settings\['OUTPUT_SPEED_MULTIPLIER'\]\?\.value \|\| "1\.0"\}\s*onChange=\{\(e\) => saveSetting\('OUTPUT_SPEED_MULTIPLIER', e\.target\.value\)\}\s*>/;

const replacement = `<select 
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 appearance-none"
                                    value={editSettings['OUTPUT_SPEED_MULTIPLIER'] !== undefined ? editSettings['OUTPUT_SPEED_MULTIPLIER'] : (settings['OUTPUT_SPEED_MULTIPLIER']?.value || "1.0")}
                                    onChange={(e) => {
                                        setEditSettings({ ...editSettings, 'OUTPUT_SPEED_MULTIPLIER': e.target.value });
                                        saveSetting('OUTPUT_SPEED_MULTIPLIER', e.target.value);
                                    }}
                                >`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/SettingsModal.tsx', content, 'utf8');
console.log('patched select');
