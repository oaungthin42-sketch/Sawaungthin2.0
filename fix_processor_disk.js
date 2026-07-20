import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const transcriptionBlockOld = `
        // 4. TRANSCRIPT ORIGINAL
        const vidTranscriptCache = path.join(cacheDir, 'vid_transcript.json');
        if (!hasCompletedStep(job.currentStep, STEPS.TRANSCRIPT_ORIGINAL)) {
            advanceStep(STEPS.TRANSCRIPT_ORIGINAL, 25, 'Transcribing Original Video Audio');
            state.originalTranscript = await transcribeOriginalVideoWithAssemblyAI(videoWavPath, vidTranscriptCache);
            
            // Compatibility validation for originalTranscript
            if (!Array.isArray(state.originalTranscript) || state.originalTranscript.length === 0) {
                throw new Error("Pipeline Error: originalTranscript is empty or invalid after AssemblyAI transcription.");
            }
            
            // Standardize format to ensure { timestamp: [start, end], text: "" }
            state.originalTranscript = state.originalTranscript.map(chunk => {
                if (chunk.timestamp && Array.isArray(chunk.timestamp) && chunk.text) {
                    return chunk;
                }
                if (chunk.start !== undefined && chunk.end !== undefined && chunk.text) {
                    return { timestamp: [chunk.start, chunk.end], text: chunk.text };
                }
                throw new Error("Pipeline Error: Invalid originalTranscript chunk format.");
            });
            saveState();
        }
`;

const transcriptionBlockNew = transcriptionBlockOld + `
        // Delete video.wav right after transcription to save disk space
        try {
            if (fs.existsSync(videoWavPath)) {
                fs.unlinkSync(videoWavPath);
                console.log("[Job " + jobId + "] Deleted video.wav to save disk space.");
            }
        } catch(e) {}
`;

content = content.replace(transcriptionBlockOld, transcriptionBlockNew);
fs.writeFileSync('src/workers/processor.js', content);
