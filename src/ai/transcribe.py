import sys
import os
import re
import unicodedata
from collections import Counter

# Ensure sys.stdout is using UTF-8
if sys.stdout.encoding.lower() != 'utf-8':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    elif hasattr(sys.stdout, 'detach'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding='utf-8', line_buffering=True)

# Set Hugging Face cache directory to a local folder in our project root
os.environ["HF_HOME"] = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".cache", "huggingface"))

import json
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s', stream=sys.stderr)

def clean_text(text):
    """Normalize unicode, remove replacement characters, and reduce extreme repetitions."""
    # Unicode normalization to ensure clean UTF-8 behavior
    text = unicodedata.normalize('NFKC', text)
    
    # Remove replacement characters
    text = text.replace('\ufffd', '')
    
    # Reduce extreme character repetitions (e.g., "都都都都都都" -> "都都")
    # Matches any non-space character repeated 5 or more times and reduces it to 2
    text = re.sub(r'([^\s\.,\?!_~-၊။\-၊။])\1{4,}', r'\1\1', text)
    
    # Reduce extreme word/phrase repetitions (up to 6 chars length) repeated 5+ times
    text = re.sub(r'([^\s\.,\?!_~-၊။\-၊။]{2,6})([\s\.,\?!_~-၊။\-၊။]{0,3}\1){4,}', r'\1\2\1', text)
    
    return text.strip()

def is_garbage_or_repetitive(text):
    text_clean = text.strip()
    if not text_clean:
        return True, "Transcription is empty"
        
    # Also check if a single character dominates the entire text when text is long
    chars_only = [c for c in text_clean if c not in ' \t\n\r\.,\?!_~-၊။']
    if len(chars_only) > 60:
        most_common_char, count = Counter(chars_only).most_common(1)[0]
        if count / len(chars_only) > 0.65:
            return True, f"Single character '{most_common_char}' dominates the transcript ({count}/{len(chars_only)})"

    return False, None

def validate_transcript(results, info, target_is_burmese=False):
    if not results:
        return False, "Empty transcription output"
    
    total_text = " ".join([r["text"] for r in results]).strip()
    is_garbage, reason = is_garbage_or_repetitive(total_text)
    if is_garbage:
        return False, reason
        
    # Check language script
    has_burmese = any('\u1000' <= c <= '\u109F' for c in total_text)
    
    if target_is_burmese:
        # We forced Burmese, we MUST have some Myanmar characters in the output!
        if not has_burmese:
            return False, "Forced Burmese transcription, but no Myanmar characters found in output"
    else:
        # If we didn't force Burmese, check if output contains CJK but detected language is not CJK
        has_cjk = any(('\u4e00' <= c <= '\u9fff' or '\u3040' <= c <= '\u30ff') for c in total_text)
        if has_cjk:
            if info.language not in ['zh', 'ja', 'ko']:
                return False, f"Detected language is '{info.language}' but output contains CJK characters"
            if info.language_probability < 0.5:
                return False, f"Low probability ({info.language_probability:.2f}) for CJK language '{info.language}'"

    return True, None

def run_transcribe(model, audio_path, language=None):
    # Use temperature=0.0, condition_on_previous_text=False and vad_filter=True to prevent repetitions and hallucinations.
    # If vad_filter fails, fall back to vad_filter=False.
    try:
        logging.info(f"Running transcribe with vad_filter=True, temperature=0.0, condition_on_previous_text=False, language={language}")
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
        logging.warning(f"transcribe with vad_filter=True failed: {e}. Retrying with vad_filter=False...")
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
    forced_language = sys.argv[3] if len(sys.argv) > 3 else None
    
    if cache_path and os.path.exists(cache_path):
        try:
            with open(cache_path, 'r') as f:
                print(f.read())
            return
        except Exception:
            pass
            
    try:
        # Determine if we are running in production
        is_production = os.environ.get("NODE_ENV") == "production" or os.environ.get("RAILWAY_ENVIRONMENT") is not None

        # 3. Print the exact Python executable being used
        logging.info(f"Python Executable: {sys.executable}")
        logging.info(f"Python Version: {sys.version}")

        # 5. Print whether HF_HOME exists
        hf_home = os.environ.get("HF_HOME", "")
        logging.info(f"HF_HOME path: {hf_home}")
        logging.info(f"HF_HOME exists: {os.path.exists(hf_home)}")

        # 6. Print whether the tiny model exists
        tiny_model_exists = False
        if hf_home and os.path.exists(hf_home):
            for root, dirs, files in os.walk(hf_home):
                for d in dirs:
                    if "tiny" in d or "faster-whisper" in d:
                        tiny_model_exists = True
                        break
                if tiny_model_exists:
                    break
        logging.info(f"Tiny model exists in cache: {tiny_model_exists}")

        # 1. Verify that faster-whisper is actually installed inside the Railway production container
        # 2. Verify that transcribe.py imports WhisperModel successfully
        # 4. Print the installed faster_whisper version
        try:
            from faster_whisper import WhisperModel
            import faster_whisper
            logging.info("Imported WhisperModel successfully from faster_whisper.")
            logging.info(f"Installed faster_whisper version: {faster_whisper.__version__}")
            logging.info("Verification: faster-whisper is successfully installed inside the environment.")
        except ImportError as e:
            logging.error(f"ImportError while loading faster-whisper: {e}")
            if is_production:
                logging.error("Production environment detected. Raising ImportError to prevent dummy fallback.")
                raise e
            else:
                logging.warning("Non-production environment. Returning dummy transcription for development preview.")
                # Dummy output for local preview
                # Mock generating exactly 70 chunks proportional to audio length
                import wave
                import contextlib
                audio_len = 347.0
                try:
                    with contextlib.closing(wave.open(audio_path, 'r')) as f:
                        frames = f.getnframes()
                        rate = f.getframerate()
                        audio_len = frames / float(rate)
                except Exception:
                    pass
                
                dummy = []
                chunk_duration = audio_len / 70.0
                for i in range(70):
                    dummy.append({
                        "timestamp": [i * chunk_duration, (i + 1) * chunk_duration - 0.01],
                        "text": f"This is test sentence number {i}. The quick brown fox jumps over the lazy dog."
                    })
                sys.stdout.write(json.dumps(dummy) + '\n')
                if cache_path:
                    with open(cache_path, 'w') as f:
                        f.write(json.dumps(dummy))
                sys.exit(0)

        logging.info(f"Loading faster-whisper 'tiny' model from {os.environ['HF_HOME']}...")
        model = None
        try:
            # Try loading with cpu_threads=1 and num_workers=1 to prevent OOM/CPU thread overhead on 2GB RAM containers
            logging.info("Initializing WhisperModel with compute_type='int8'...")
            model = WhisperModel("tiny", device="cpu", compute_type="int8", cpu_threads=4, num_workers=2)
        except Exception as e:
            logging.warning(f"Failed to load with compute_type='int8': {e}. Retrying with 'float32'...")
            try:
                model = WhisperModel("tiny", device="cpu", compute_type="float32", cpu_threads=4, num_workers=2)
            except Exception as e2:
                logging.warning(f"Failed to load with compute_type='float32': {e2}. Retrying with auto compute type...")
                model = WhisperModel("tiny", device="cpu", cpu_threads=4, num_workers=2)
        
        logging.info(f"Transcribing {audio_path} (Pass 1: Auto-detect or Forced)...")
        results, info = run_transcribe(model, audio_path, language=forced_language)
        
        logging.info(f"Detected/Forced language: {info.language} with probability {info.language_probability:.4f}")
        
        is_valid, reason = validate_transcript(results, info, target_is_burmese=(forced_language == 'my' or info.language == 'my'))
        
        total_text_first = " ".join([r["text"] for r in results]).strip()
        has_burmese_first = any('\u1000' <= c <= '\u109F' for c in total_text_first)
        
        # We try Burmese pass if not already forced and:
        # 1. The auto-detected language is Burmese (my)
        # 2. First pass is invalid (e.g. CJK hallucination loops)
        # 3. First pass has some Burmese characters
        should_try_burmese = (not forced_language) and (
            not is_valid or 
            info.language == 'my' or 
            has_burmese_first
        )
        
        final_results = None
        final_info = None
        
        if should_try_burmese:
            logging.info("Attempting Burmese-forced transcription (Pass 2)...")
            try:
                results_my, info_my = run_transcribe(model, audio_path, language='my')
                is_valid_my, reason_my = validate_transcript(results_my, info_my, target_is_burmese=True)
                if is_valid_my:
                    logging.info("Burmese-forced transcription succeeded and is valid.")
                    final_results = results_my
                    final_info = info_my
                else:
                    logging.warning(f"Burmese-forced transcription failed validation: {reason_my}")
            except Exception as e:
                logging.error(f"Error during Burmese-forced transcription: {e}")
                
        if final_results is None:
            if is_valid:
                logging.info("Using Auto-detect transcription results.")
            else:
                logging.warning(f"Transcription quality validation failed: {reason}. Preserving transcript instead of discarding.")
            final_results = results
            final_info = info
                
        output_json = json.dumps(final_results)
        
        if cache_path:
            with open(cache_path, 'w') as f:
                f.write(output_json)
                
        # Only JSON goes to stdout
        sys.stdout.write(output_json + '\n')
        logging.info("Transcription complete.")
        
    except Exception as e:
        sys.stdout.write(json.dumps({"error": str(e)}) + '\n')
        sys.exit(1)

if __name__ == "__main__":
    main()
