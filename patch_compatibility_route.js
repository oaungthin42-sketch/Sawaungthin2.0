import fs from 'fs';

let content = fs.readFileSync('src/routes/api.js', 'utf8');

const target = `router.post('/process', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => {`;
const replacement = `router.post('/process', upload.single('video'), (req, res) => {`;

content = content.replace(target, replacement);

const target2 = `const audioFile = req.files && req.files['audio'] ? req.files['audio'][0] : null;`;
const replacement2 = `const audioFile = null;`;
content = content.replace(target2, replacement2);

const target3 = `const videoFile = req.files && req.files['video'] ? req.files['video'][0] : null;`;
const replacement3 = `const videoFile = req.file;`;
content = content.replace(target3, replacement3);

fs.writeFileSync('src/routes/api.js', content);
console.log("Patched compatibility route.");
