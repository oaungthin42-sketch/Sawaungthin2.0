import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function run() {
    const form = new FormData();
    form.append('video', fs.createReadStream('/app/applet/data/test_video.mp4'));
    
    console.log("Sending request to localhost:3000");
    const res = await fetch('http://localhost:3000/api/process-recap', {
        method: 'POST',
        body: form
    });
    
    console.log("Response:", res.status);
    const data = await res.json();
    console.log(data);
}
run();
