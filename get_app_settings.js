import fs from 'fs';
const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
let start = lines.findIndex(l => l.includes('showSettings && ('));
let end = lines.findIndex((l, i) => i > start && l.includes('        </div>') && lines[i+1]?.includes('      </div>') && lines[i+2]?.includes('    </div>') && lines[i+3]?.includes('  )'));
console.log(start, end);
