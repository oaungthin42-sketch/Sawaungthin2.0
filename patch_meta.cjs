const fs = require('fs');

// update index.html
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<title>.*?<\/title>/, '<title>SuperClick</title>');
fs.writeFileSync('index.html', html, 'utf8');

// update metadata.json
let meta = JSON.parse(fs.readFileSync('metadata.json', 'utf8'));
meta.name = "SuperClick";
fs.writeFileSync('metadata.json', JSON.stringify(meta, null, 2), 'utf8');

