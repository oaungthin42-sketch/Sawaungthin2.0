import sys

with open('src/workers/processor.js', 'r') as f:
    content = f.read()

content = content.replace("path.join(cacheDir, 'concat.txt')\n            ];", "path.join(cacheDir, 'concat.txt'),\n                path.join(cacheDir, 'aconcat.txt'),\n                path.join(cacheDir, 'bg_audio.wav')\n            ];")

with open('src/workers/processor.js', 'w') as f:
    f.write(content)
