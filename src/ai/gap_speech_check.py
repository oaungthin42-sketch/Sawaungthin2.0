import sys
import json
import logging
import os
import re

WHISPER_THREADS = int(os.environ.get("WHISPER_THREADS", "0")) or min(8, os.cpu_count() or 2)

# Send logging to stderr to prevent stdout corruption
logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
os.environ["HF_HOME"] = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".cache", "huggingface"))


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Error: Missing audio file path argument.\n")
        sys.exit(1)

    audio_path = sys.argv[1]

    try:
        gaps_raw = sys.argv[2] if len(sys.argv) >= 3 else sys.stdin.read()
        if not gaps_raw or not gaps_raw.strip():
            sys.stderr.write("Error: Missing gaps JSON argument or stdin.\n")
            sys.exit(1)
        gaps = json.loads(gaps_raw)
        if not isinstance(gaps, list):
            sys.stderr.write("Error: Gaps JSON must be a list.\n")
            sys.exit(1)
    except Exception as e:
        sys.stderr.write(f"Error parsing gaps JSON: {e}\n")
        sys.exit(1)

    try:
        import faster_whisper.audio
        import faster_whisper.vad
        from faster_whisper.vad import VadOptions
        from faster_whisper import WhisperModel

        audio = faster_whisper.audio.decode_audio(audio_path, sampling_rate=16000)

        # 1. Run Silero VAD once on the full original audio
        speech_timestamps = faster_whisper.vad.get_speech_timestamps(
            audio,
            VadOptions(threshold=0.25, min_speech_duration_ms=80)
        )

        vad_intervals = []
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
                vad_intervals.append({"start": start_sec, "end": end_sec})

        # 2. Load WhisperModel once and transcribe only the gap slices
        whisper_intervals = []
        if len(gaps) > 0:
            model = None
            try:
                model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=WHISPER_THREADS, num_workers=1)
            except Exception as e:
                sys.stderr.write(f"Warning: Failed to load model with compute_type='int8': {e}\n")
                try:
                    model = WhisperModel("small", device="cpu", compute_type="float32", cpu_threads=WHISPER_THREADS, num_workers=1)
                except Exception as e2:
                    sys.stderr.write(f"Warning: Failed to load model with compute_type='float32': {e2}\n")
                    try:
                        model = WhisperModel("small", device="cpu", cpu_threads=WHISPER_THREADS, num_workers=1)
                    except Exception as e3:
                        sys.stderr.write(f"Error: Failed to load model with auto compute_type: {e3}\n")
                        sys.exit(1)

            total_samples = len(audio)
            total_audio_sec = total_samples / 16000.0

            for g in gaps:
                if not isinstance(g, dict):
                    continue
                g_start = float(g.get("start", 0))
                g_end = float(g.get("end", 0))
                start_sample = max(0, min(total_samples, int(round(g_start * 16000))))
                end_sample = max(0, min(total_samples, int(round(g_end * 16000))))
                if end_sample - start_sample < 1600:
                    continue

                slice_start_sec = start_sample / 16000.0
                slice_audio = audio[start_sample:end_sample]

                segments, _ = model.transcribe(
                    slice_audio,
                    beam_size=1,
                    word_timestamps=True,
                    condition_on_previous_text=False,
                    vad_filter=False
                )

                for segment in segments:
                    text = (segment.text or "").strip()
                    non_space_len = len(re.sub(r"\s+", "", text))
                    no_speech_prob = getattr(segment, "no_speech_prob", 1.0)
                    avg_logprob = getattr(segment, "avg_logprob", -999.0)
                    compression_ratio = getattr(segment, "compression_ratio", 999.0)

                    if (
                        no_speech_prob < 0.6
                        and avg_logprob > -1.2
                        and compression_ratio < 2.4
                        and non_space_len >= 2
                    ):
                        abs_start = round(max(0.0, slice_start_sec + float(segment.start)), 3)
                        abs_end = round(min(total_audio_sec, slice_start_sec + float(segment.end)), 3)
                        if abs_end > abs_start:
                            whisper_intervals.append({
                                "start": abs_start,
                                "end": abs_end,
                                "text": text
                            })

        sys.stdout.write(json.dumps({"vad": vad_intervals, "whisper": whisper_intervals}) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"Error in gap_speech_check: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
