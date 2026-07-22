from pydub import AudioSegment
import math
import os

# Generate a spoken word track instead of a pure sine wave, 
# faster-whisper needs voice-like structures
try:
    # Just grab an existing mp3 or generate something with tts
    os.system("node generate_all_videos.js") 
except Exception as e:
    print(e)
