const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

const target = `                let A = Math.max(0, st - 0.3);
                let B = et + 0.3;
                
                // ducking filters are now applied per-segment

            console.log(\`[AUDIO-MIX-DIAGNOSTIC]\`);`;

const replacement = `                let A = Math.max(0, st - 0.3);
                let B = et + 0.3;
                
                if (mergedIntervals.length > 0) {
                    let last = mergedIntervals[mergedIntervals.length - 1];
                    if (A <= last.B) {
                        last.B = Math.max(last.B, B);
                    } else {
                        mergedIntervals.push({ A, B });
                    }
                } else {
                    mergedIntervals.push({ A, B });
                }
            }
            
            // ducking filters are now applied per-segment

            console.log(\`[AUDIO-MIX-DIAGNOSTIC]\`);`;

code = code.replace(target, replacement);
fs.writeFileSync('src/workers/processor.js', code);
