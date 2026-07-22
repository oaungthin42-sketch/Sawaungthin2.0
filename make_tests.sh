#!/bin/bash
set -e
# make 10s video with sine wave audio
./node_modules/ffmpeg-static/ffmpeg -y -f lavfi -i color=c=blue:s=1280x720:d=10 -f lavfi -i "aevalsrc=sin(440*2*PI*t)*0.2:d=10" -c:v libx264 -c:a aac data/test_10s.mp4

# make 30s
cat << 'F' > concat3.txt
file 'data/test_10s.mp4'
file 'data/test_10s.mp4'
file 'data/test_10s.mp4'
F
./node_modules/ffmpeg-static/ffmpeg -y -f concat -safe 0 -i concat3.txt -c copy data/test_30s.mp4

# make 60s
cat << 'F' > concat6.txt
file 'data/test_10s.mp4'
file 'data/test_10s.mp4'
file 'data/test_10s.mp4'
file 'data/test_10s.mp4'
file 'data/test_10s.mp4'
file 'data/test_10s.mp4'
F
./node_modules/ffmpeg-static/ffmpeg -y -f concat -safe 0 -i concat6.txt -c copy data/test_60s.mp4

# make 5m (300s) - 5x60s
cat << 'F' > concat5m.txt
file 'data/test_60s.mp4'
file 'data/test_60s.mp4'
file 'data/test_60s.mp4'
file 'data/test_60s.mp4'
file 'data/test_60s.mp4'
F
./node_modules/ffmpeg-static/ffmpeg -y -f concat -safe 0 -i concat5m.txt -c copy data/test_300s.mp4

ls -lh data/*.mp4
