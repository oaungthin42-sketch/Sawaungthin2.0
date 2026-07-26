const fs = require('fs');
let content = fs.readFileSync('src/routes/api.js', 'utf8');

content = content.replace(
/const originalName = req\.file\.originalname;/g,
"const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');"
);

content = content.replace(
/originalFilename: videoFile\.originalname/g,
"originalFilename: Buffer.from(videoFile.originalname, 'latin1').toString('utf8')"
);

fs.writeFileSync('src/routes/api.js', content, 'utf8');
