const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const colorPickerHTML = `
                      <div className="mt-4 pt-4 border-t border-gray-800">
                        <label className="text-gray-400 text-xs font-bold mb-3 block">Subtitle Color</label>
                        <div className="flex gap-3">
                          <button onClick={() => setSubtitleColor('white')} className={\`w-8 h-8 rounded-full bg-white border-2 \${subtitleColor === 'white' ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-gray-600'}\`} title="White" />
                          <button onClick={() => setSubtitleColor('yellow')} className={\`w-8 h-8 rounded-full bg-yellow-400 border-2 \${subtitleColor === 'yellow' ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-gray-600'}\`} title="Yellow" />
                          <button onClick={() => setSubtitleColor('blue')} className={\`w-8 h-8 rounded-full bg-blue-500 border-2 \${subtitleColor === 'blue' ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-gray-600'}\`} title="Blue" />
                        </div>
                      </div>
`;

code = code.replace(
  /                      \)\s*:\s*\(\s*<div className="text-xs text-gray-500 py-6 text-center">Click "Edit Size"[^<]*<\/div>\s*\)\s*\}/,
  `                      ) : (
                        <div className="text-xs text-gray-500 py-6 text-center">Click "Edit Size" or select the subtitle box on the video to manually adjust dimensions.</div>
                      )}
${colorPickerHTML}`
);

fs.writeFileSync('src/App.tsx', code, 'utf8');
