import sys
import os

path = 'data/cache/1de068df-332e-447a-95e7-0aa005ecb08e/mixed_audio.wav'
if os.path.exists(path):
    print("Found mixed_audio.wav:", os.path.getsize(path))
else:
    print("mixed_audio.wav missing")

path = 'data/cache/1de068df-332e-447a-95e7-0aa005ecb08e/bg_audio.wav'
if os.path.exists(path):
    print("Found bg_audio.wav:", os.path.getsize(path))
else:
    print("bg_audio.wav missing")

path = 'data/cache/1de068df-332e-447a-95e7-0aa005ecb08e/narration_tts.wav'
if os.path.exists(path):
    print("Found narration_tts.wav:", os.path.getsize(path))
else:
    print("narration_tts.wav missing")

