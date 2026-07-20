import fs from 'fs';

let content = fs.readFileSync('src/routes/api.js', 'utf8');

const target = `router.post('/process-recap', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => {
    const videoFile = req.files && req.files['video'] ? req.files['video'][0] : null;
    const audioFile = req.files && req.files['audio'] ? req.files['audio'][0] : null;

    if (!videoFile || !audioFile) {
        return res.status(400).json({ error: 'Video and Narration Audio files are required' });
    }

    const jobId = uuidv4();
    createJob(jobId, {
        videoPath: videoFile.path,
        audioPath: audioFile.path,
    });
    
    res.json({ jobId });

    addJobToQueue(jobId);
});`;

const replacement = `router.post('/process-recap', upload.single('video'), (req, res) => {
    const videoFile = req.file;

    if (!videoFile) {
        return res.status(400).json({ error: 'Video file is required' });
    }

    const jobId = uuidv4();
    createJob(jobId, {
        videoPath: videoFile.path,
        audioPath: null,
    });
    
    res.json({ jobId });

    addJobToQueue(jobId);
});`;

if (content.includes("Video and Narration Audio files are required")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/routes/api.js', content);
    console.log("Patched successfully.");
} else {
    console.log("Target not found.");
}
