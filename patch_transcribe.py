import sys
import re

with open('src/ai/transcribe.py', 'r') as f:
    content = f.read()

# Modify cpu_threads and num_workers from 1 to 4
content = content.replace(
    'cpu_threads=1, num_workers=1',
    'cpu_threads=4, num_workers=2'
)

with open('src/ai/transcribe.py', 'w') as f:
    f.write(content)
