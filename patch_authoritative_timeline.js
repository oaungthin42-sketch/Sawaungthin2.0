import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const targetDialogueStart = `                let currentTimelineTime = groupOrigStart;
                
                for (let k = 0; k < group.length; k++) {`;

const replDialogueStart = `                let currentTimelineTime = groupOrigStart;
                
                for (let k = 0; k < group.length; k++) {`;

// Let's replace the loop in DialogueStyle
