const fs = require('fs');

let content = fs.readFileSync('src/ffmpeg/index.js', 'utf8');

content = content.replace("import ffmpegPath from 'ffmpeg-static';", "import _ffmpegPath from 'ffmpeg-static';\nimport { execSync } from 'child_process';\nlet ffmpegPath = _ffmpegPath;\ntry { execSync('ffmpeg -version'); ffmpegPath = 'ffmpeg'; } catch (e) {}");

fs.writeFileSync('src/ffmpeg/index.js', content);
