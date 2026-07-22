import sys

with open('src/workers/processor.js', 'r') as f:
    content = f.read()

content = content.replace("const concatFile = path.join(cacheDir, 'concat.txt'),\n                path.join(cacheDir, 'aconcat.txt'),\n                path.join(cacheDir, 'bg_audio.wav');", "const concatFile = path.join(cacheDir, 'concat.txt');")

with open('src/workers/processor.js', 'w') as f:
    f.write(content)
