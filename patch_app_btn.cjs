const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `<label className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-gray-700 hover:border-indigo-500 bg-gray-950/50 hover:bg-indigo-950/20 text-gray-300 font-semibold text-sm rounded-xl cursor-pointer transition-all">
                        <UploadCloud className="w-5 h-5 text-indigo-400" />
                        Upload Custom Font
                        <input type="file" accept=".ttf,.otf" className="hidden" onChange={handleFontUpload} />
                      </label>`;

const replacement = `<label className={\`flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-gray-700 hover:border-indigo-500 bg-gray-950/50 hover:bg-indigo-950/20 text-gray-300 font-semibold text-sm rounded-xl cursor-pointer transition-all \${fontUploadStatus === 'Uploading...' ? 'opacity-50 pointer-events-none' : ''}\`}>
                        <UploadCloud className="w-5 h-5 text-indigo-400" />
                        {fontUploadStatus === 'Uploading...' ? 'Uploading...' : 'Upload Custom Font'}
                        <input type="file" accept=".ttf,.otf" className="hidden" onChange={handleFontUpload} disabled={fontUploadStatus === 'Uploading...'} />
                      </label>`;

code = code.replace(target, replacement);
fs.writeFileSync('src/App.tsx', code, 'utf8');
