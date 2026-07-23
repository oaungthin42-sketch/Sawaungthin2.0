import sys, json, os, logging

def clean_text(text):
    return text.strip()

def run_transcribe(model, audio_path, language=None):
    try:
        segments, info = model.transcribe(
            audio_path,
            beam_size=3,
            language=language,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True
        )
        results = []
        for segment in segments:
            cleaned = clean_text(segment.text)
            if cleaned:
                results.append({
                    "timestamp": [segment.start, segment.end],
                    "text": cleaned
                })
        return results, info
    except Exception as e:
        segments, info = model.transcribe(
            audio_path,
            beam_size=3,
            language=language,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=False
        )
        results = []
        for segment in segments:
            cleaned = clean_text(segment.text)
            if cleaned:
                results.append({
                    "timestamp": [segment.start, segment.end],
                    "text": cleaned
                })
        return results, info

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio file path"}))
        sys.exit(1)
        
    audio_path = sys.argv[1]
    cache_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    if cache_path and os.path.exists(cache_path):
        try:
            with open(cache_path, 'r') as f:
                print(f.read())
            return
        except Exception:
            pass
            
    try:
        from faster_whisper import WhisperModel
        # Use a small model and float32 to avoid quantization errors on some architectures if int8 isn't supported, 
        # but int8 is faster. The user says 8 vCPU, 8 GB RAM.
        model = WhisperModel("tiny", device="cpu", compute_type="int8", cpu_threads=4, num_workers=2)
        results, info = run_transcribe(model, audio_path)
        
        if cache_path:
            with open(cache_path, 'w') as f:
                f.write(json.dumps(results))
                
        sys.stdout.write(json.dumps(results) + '\n')
    except Exception as e:
        sys.stdout.write(json.dumps({"error": str(e)}) + '\n')
        sys.exit(1)

if __name__ == "__main__":
    main()
