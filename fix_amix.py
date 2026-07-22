import sys
import re

with open('src/workers/processor.js', 'r') as f:
    content = f.read()

# Fix the broken replace(/\/g, '/')
content = content.replace("replace(/\//g, '/')", "replace(/\\\\\\\\/g, '/')")
# It's currently replace(/\/g, '/')
content = content.replace("replace(/\//g, '/')", "replace(/\\\\\\\\/g, '/')")
# Wait, let's just use string replace for the exact string it is right now.
content = content.replace(r"replace(/\/g, '/')", r"replace(/\\/g, '/')")

with open('src/workers/processor.js', 'w') as f:
    f.write(content)
