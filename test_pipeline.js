import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

async function test() {
    const form = new FormData();
    form.append('video', fs.createReadStream('dummy_10s.mp4'));
    
    try {
        console.log("Uploading test video...");
        const res = await axios.post('http://localhost:3000/api/process-recap', form, {
            headers: form.getHeaders(),
        });
        const jobId = res.data.jobId;
        console.log("Job ID:", jobId);
        
        let lastStep = '';
        while(true) {
            const statusRes = await axios.get(`http://localhost:3000/api/status/${jobId}`);
            const job = statusRes.data;
            if (job.currentStep !== lastStep) {
                console.log(`[${job.status}] Step: ${job.currentStep} (${job.progress}%)`);
                lastStep = job.currentStep;
            }
            if (job.status === 'complete' || job.status === 'error') {
                console.log(`Final Status: ${job.status}`);
                if (job.error) console.log(`Error: ${job.error}`);
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch(e) {
        console.error("Test error:", e.response ? e.response.data : e.message);
    }
}
test();
