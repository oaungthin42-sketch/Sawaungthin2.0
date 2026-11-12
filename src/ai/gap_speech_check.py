import sys
import json
import logging

logging.basicConfig(level=logging.WARNING, stream=sys.stderr)

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Error: Missing audio file path argument.\n")
        sys.exit(1)

    audio_path = sys.argv[1]

    try:
        import faster_whisper.audio
        import faster_whisper.vad
        from faster_whisper.vad import VadOptions

        audio = faster_whisper.audio.decode_audio(audio_path, sampling_rate=16000)
        speech_timestamps = faster_whisper.vad.get_speech_timestamps(
            audio,
            VadOptions(threshold=0.25, min_speech_duration_ms=80)
        )

        intervals = []
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
            start_sec = round(float(s) / 16000.0, 3)
            end_sec = round(float(e) / 16000.0, 3)
            if end_sec > start_sec:
                intervals.append({"start": start_sec, "end": end_sec})

        sys.stdout.write(json.dumps(intervals) + "\n")
    except Exception as e:
        sys.stderr.write(f"Error in gap_speech_check: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
