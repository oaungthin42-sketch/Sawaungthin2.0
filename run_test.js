import { processRecapPipeline } from './src/workers/processor.js';
import { createJob, setJobKeys } from './src/services/jobManager.js';
import fs from 'fs';
import path from 'path';

async function run() {
    console.log("Setting up job...");
    const jobId = "test_job_" + Date.now();
    
    const origPath = path.join(process.cwd(), 'data', 'test_input', 'input_video.mp4');
    const videoPath = path.join(process.cwd(), 'data', jobId + '_video.mp4');
    fs.copyFileSync(origPath, videoPath);
    
    createJob(jobId, { videoPath, audioPath: null });
    
    const envGemini = process.env.GEMINI_API_KEY;
    const envAssembly = process.env.ASSEMBLYAI_API_KEY;
    
    setJobKeys(jobId, {
        geminiApiKey: envGemini || '',
        assemblyApiKey: envAssembly || ''
    });
    
    console.log("Running processor for job:", jobId);
    
    try {
        await processRecapPipeline(jobId);
        console.log("PROCESSOR FINISHED.");
    } catch(e) {
        console.error("PROCESSOR FAILED:", e);
    }
}
run();
