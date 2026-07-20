const txt = `[FFmpeg] Running command: ffmpeg -f lavfi -i anullsrc=r=24000:cl=mono -t 10.000 -acodec pcm_s16le -ar 24000 -ac 1 -y /app/applet/data/cache_test_tts/tts_chunks/gap_0.wav
[AI-DIAGNOSTIC] Gap Before Chunk 0 | Intended Dur: 10.000 | Actual Dur: 10.000 | Timeline: 0.00->10.00
[AI] Dialogue Group Chunk 0 tempo adjusted by 1.14x (Group Stable Speed)
[FFmpeg] Running command: ffmpeg -i /app/applet/data/cache_test_tts/tts_chunks/chunk_0000.wav -filter:a atempo=1.144 -acodec pcm_s16le -ar 24000 -ac 1 -y /app/applet/data/cache_test_tts/tts_chunks/chunk_adj_0000.wav
[AI-DIAGNOSTIC] Chunk 0 | Orig: 0.00->5.00 (dur: 5.00) | TTS: chunk_adj_0000.wav (size: 209708, dur: 4.37, format: pcm_s16le, 24000Hz, 1ch) | Final Timeline: 10.00->14.37
[FFmpeg] Running command: ffmpeg -f lavfi -i anullsrc=r=24000:cl=mono -t 10.000 -acodec pcm_s16le -ar 24000 -ac 1 -y /app/applet/data/cache_test_tts/tts_chunks/gap_1.wav
[AI-DIAGNOSTIC] Gap Before Chunk 1 | Intended Dur: 10.000 | Actual Dur: 10.000 | Timeline: 14.37->24.37
[AI-DIAGNOSTIC] Narration Chunk 1 | Orig: 10.00->15.00 (dur: 5.00) | TTS Size: 240044, Dur: 5.00, format: pcm_s16le, 24000Hz, 1ch | Final Timeline: 24.37->29.37`;
console.log(txt);
