import fs from 'fs';
const dir = 'data/cache/test_job_1784529293713';
let count = 0;
while(count < 70) {
    count = 0;
    const files = fs.readdirSync(dir);
    for(const f of files) {
        if(f.startsWith('seg_') && f.endsWith('.mp4')) count++;
    }
    if (count >= 70) break;
    // sleep
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
}
console.log("All 70 segments finished!");
