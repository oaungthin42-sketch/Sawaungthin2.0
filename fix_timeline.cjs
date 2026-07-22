const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

// Remove the wrongly placed global_start calculation
const badCode = `            let currentGlobalTime = 0;
            for (let i = 0; i < state.timeline.length; i++) {
                state.timeline[i].global_start = currentGlobalTime;
                currentGlobalTime += state.timeline[i].target_dur;
            }
            
            let authTimeline = [];`;

code = code.replace(badCode, `            let authTimeline = [];`);

// Add it correctly before the limit = 5 loop
const insertTarget = `                const limit = 5;
                for (let i = 0; i < state.timeline.length; i += limit) {`;

const insertion = `                let currentGlobalTime = 0;
                for (let i = 0; i < state.timeline.length; i++) {
                    state.timeline[i].global_start = currentGlobalTime;
                    currentGlobalTime += state.timeline[i].target_dur;
                }
                const limit = 5;
                for (let i = 0; i < state.timeline.length; i += limit) {`;

code = code.replace(insertTarget, insertion);

fs.writeFileSync('src/workers/processor.js', code);
