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
        console.log("Upload response:", res.data);
    } catch(e) {
        console.error("Upload error:", e.response ? e.response.data : e.message);
    }
}
test();
