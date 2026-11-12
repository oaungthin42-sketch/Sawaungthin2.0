import sys
import json
import logging

logging.basicConfig(level=logging.WARNING, stream=sys.stderr)

def main():
    try:
        if len(sys.argv) < 2:
            sys.stderr.write("Error: Missing audio file path argument.\n")
            sys.stdout.write(json.dumps({"speech_seconds": 0}) + "\n")
            return

        audio_path = sys.argv[1]

        import faster_whisper.audio
        import faster_whisper.vad
        from faster_whisper.vad import VadOptions

        audio = faster_whisper.audio.decode_audio(audio_path, sampling_rate=16000)
        speech_timestamps = faster_whisper.vad.get_speech_timestamps(
            audio,
            VadOptions(threshold=0.35, min_speech_duration_ms=150)
        )

        total_samples = 0
        for ts in speech_timestamps:
            if isinstance(ts, dict):
                s = ts.get("start", 0)
                e = ts.get("end", 0)
            elif isinstance(ts, (list, tuple)):
                s = ts[0]
                e = ts[1]
            else:
                s = getattr(ts, "start", 0)
                e = getattr(ts, "end", 0)
            total_samples += max(0, e - s)

        speech_seconds = float(total_samples / 16000.0)
        sys.stdout.write(json.dumps({"speech_seconds": speech_seconds}) + "\n")

    except Exception as e:
        sys.stderr.write(f"Error in gap_speech_check: {e}\n")
        sys.stdout.write(json.dumps({"speech_seconds": 0}) + "\n")

if __name__ == "__main__":
    main()
