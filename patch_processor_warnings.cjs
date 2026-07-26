const fs = require('fs');
let code = fs.readFileSync('src/workers/processor.js', 'utf8');

const target1 = `            try {
                let parsedBoxes = typeof job.blurBoxes === 'string' ? JSON.parse(job.blurBoxes) : job.blurBoxes;`;

const replacement1 = `            try {
                let parsedBoxes = typeof job.blurBoxes === 'string' ? JSON.parse(job.blurBoxes) : job.blurBoxes;`;

// wait, let's just do sed
