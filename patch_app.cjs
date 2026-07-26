const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `<h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-4 flex items-center gap-2">`;
const replacement = `{analysisData.warnings && analysisData.warnings.length > 0 && (
                  <div className="mb-4 bg-orange-950/40 border border-orange-900/50 p-4 rounded-xl flex flex-col gap-2">
                    <h4 className="text-orange-400 font-bold text-xs uppercase flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Warnings during processing:
                    </h4>
                    <ul className="list-disc pl-5 text-orange-300/80 text-sm space-y-1">
                      {analysisData.warnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-4 flex items-center gap-2">`;

code = code.replace(target, replacement);

fs.writeFileSync('src/App.tsx', code, 'utf8');
