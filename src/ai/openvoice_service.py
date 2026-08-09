import os
os.environ["CUDA_VISIBLE_DEVICES"] = ""
import logging

# Monkeypatch faster-whisper BEFORE any imports to force CPU usage
try:
    from faster_whisper import WhisperModel
    # Save original class
    OriginalWhisperModel = WhisperModel
    # Override class
    class CPUWhisperModel(OriginalWhisperModel):
        def __init__(self, *args, **kwargs):
            # Force 'small' model size
            model_size = 'small'
            if len(args) > 0:
                args = (model_size,) + args[1:]
            else:
                kwargs['model_size_or_path'] = model_size
            
            kwargs['device'] = 'cpu'
            kwargs['compute_type'] = 'int8'
            super().__init__(*args, **kwargs)
    import faster_whisper
    faster_whisper.WhisperModel = CPUWhisperModel
    logging.info("Monkey-patched faster_whisper to force CPU.")
except ImportError:
    pass

import sys
logging.info(f"sys.path: {sys.path}")
try:
    import torch
except ImportError:
    print("ModuleNotFoundError: No module named torch. Disabling Voice Clone.")
    sys.exit(0)

# Ensure src/ai is in the python path to load openvoice dependencies if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

# Import OpenVoice API
try:
    from openvoice import se_extractor
    from openvoice.api import ToneColorConverter
except ImportError as e:
    logging.error(f"Failed to import OpenVoice modules: {e}. Make sure openvoice-cli is installed.")
    sys.exit(1)

app = FastAPI(title="OpenVoice V2 Tone Color Converter Service")

# Locate checkpoints
CHECKPOINT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "checkpoints_v2"))
CONVERTER_DIR = os.path.join(CHECKPOINT_DIR, "converter")

# Device configuration
device = "cuda" if torch.cuda.is_available() else "cpu"
logging.info(f"Using device: {device}")

# Global ToneColorConverter instance
tone_color_converter = None

@app.on_event("startup")
def load_models():
    global tone_color_converter
    config_path = os.path.join(CONVERTER_DIR, "config.json")
    checkpoint_path = os.path.join(CONVERTER_DIR, "checkpoint.pth")
    
    if not os.path.exists(config_path) or not os.path.exists(checkpoint_path):
        logging.error(f"Checkpoints not found at {CONVERTER_DIR}. Please run download_openvoice.py first.")
        # We don't hard crash here so the Docker/server build can pass even if checkpoints are missing during dry builds, but we log the error.
        return

    try:
        logging.info(f"Loading ToneColorConverter from {CONVERTER_DIR}...")
        tone_color_converter = ToneColorConverter(config_path, device=device)
        tone_color_converter.load_ckpt(checkpoint_path)
        logging.info("ToneColorConverter successfully loaded and resident in memory.")
    except Exception as e:
        logging.error(f"Failed to load ToneColorConverter: {e}")

def get_converter_or_raise():
    global tone_color_converter
    if tone_color_converter is None:
        # Try loading on the fly if it wasn't loaded during startup
        load_models()
        if tone_color_converter is None:
            raise HTTPException(status_code=503, detail="ToneColorConverter model is not loaded. Check checkpoints.")
    return tone_color_converter

def get_se_synthetic(audio_path, converter):
    # Synthetic TTS audio is clean and contains no background noise or long silences
    # that would require VAD or Whisper-based segmentation. We can bypass se_extractor's
    # brittle text-length and duration filters entirely and extract the embedding
    # directly from the full audio waveform.
    try:
        logging.info(f"[get_se_synthetic] Extracting embedding directly (no VAD/Whisper) for {audio_path}")
        se = converter.extract_se([audio_path])
        logging.info(f"[get_se_synthetic] Successfully extracted embedding with shape: {se.shape}")
        label = f"source (synthetic) from {os.path.basename(audio_path)}"
        logging.info(f"[VOICE-EMBED-DIAGNOSTIC] label={label} shape={list(se.shape)} "
                     f"dtype={se.dtype} device={se.device} numel={se.numel()} "
                     f"min={se.min().item():.4f} max={se.max().item():.4f} "
                     f"mean={se.mean().item():.4f} l2_norm={se.norm().item():.4f} "
                     f"finite={torch.isfinite(se).all().item()} "
                     f"effectively_zero={(se.abs().max().item() < 1e-6)}")
        return se
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logging.warning(f"[get_se_synthetic] Direct extraction failed: {e}. Falling back to get_se_safe...")
        return get_se_safe(audio_path, converter, label=f"source (synthetic) from {os.path.basename(audio_path)}")

class ExtractRequest(BaseModel):
    audio_path: str
    cache_path: str
    is_synthetic: bool = False

class ConvertRequest(BaseModel):
    source_audio_path: str
    source_embedding_path: str = None
    reference_embedding_path: str = None
    reference_audio_path: str = None
    output_path: str = None
    tau: float = 0.3

def get_se_target_direct(audio_path, converter):
    """
    Extracts target speaker embedding directly from the full audio file without VAD or Whisper-based segmentation.
    This avoids chunking and averaging, which can dilute the voice characteristics.
    """
    try:
        logging.info(f"[get_se_target_direct] Extracting reference embedding directly (no VAD/segmentation) for {audio_path}")
        se = converter.extract_se([audio_path])
        logging.info(f"[get_se_target_direct] Successfully extracted reference embedding with shape: {se.shape}")
        label = f"target from {os.path.basename(audio_path)}"
        logging.info(f"[VOICE-EMBED-DIAGNOSTIC] label={label} shape={list(se.shape)} "
                     f"dtype={se.dtype} device={se.device} numel={se.numel()} "
                     f"min={se.min().item():.4f} max={se.max().item():.4f} "
                     f"mean={se.mean().item():.4f} l2_norm={se.norm().item():.4f} "
                     f"finite={torch.isfinite(se).all().item()} "
                     f"effectively_zero={(se.abs().max().item() < 1e-6)}")
        return se
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logging.warning(f"[get_se_target_direct] Direct extraction failed: {e}. Falling back to get_se_safe...")
        return get_se_safe(audio_path, converter, label=f"target from {os.path.basename(audio_path)}")

def get_se_safe(audio_path, converter, label="embedding"):
    """
    Robust speaker embedding extraction, attempting VAD first and falling back to non-VAD if needed.
    """
    try:
        logging.info(f"[get_se_safe] Converter methods: {dir(converter)}")
        se, _ = se_extractor.get_se(audio_path, converter, vad=True)
        logging.info(f"[get_se_safe] Successfully extracted embedding with shape: {se.shape}")
        logging.info(f"[VOICE-EMBED-DIAGNOSTIC] label={label} shape={list(se.shape)} "
                     f"dtype={se.dtype} device={se.device} numel={se.numel()} "
                     f"min={se.min().item():.4f} max={se.max().item():.4f} "
                     f"mean={se.mean().item():.4f} l2_norm={se.norm().item():.4f} "
                     f"finite={torch.isfinite(se).all().item()} "
                     f"effectively_zero={(se.abs().max().item() < 1e-6)}")
        return se
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logging.warning(f"Embedding extraction with VAD failed for {audio_path}: {e}. Retrying with vad=False...")
        try:
            se, _ = se_extractor.get_se(audio_path, converter, vad=False)
            logging.info(f"[get_se_safe] Successfully extracted embedding with shape: {se.shape}")
            logging.info(f"[VOICE-EMBED-DIAGNOSTIC] label={label} shape={list(se.shape)} "
                         f"dtype={se.dtype} device={se.device} numel={se.numel()} "
                         f"min={se.min().item():.4f} max={se.max().item():.4f} "
                         f"mean={se.mean().item():.4f} l2_norm={se.norm().item():.4f} "
                         f"finite={torch.isfinite(se).all().item()} "
                         f"effectively_zero={(se.abs().max().item() < 1e-6)}")
            return se
        except Exception as inner_e:
            if isinstance(inner_e, HTTPException):
                raise inner_e
            logging.error(f"[get_se_safe] Failed to extract embedding for {audio_path} — no speech segments detected: {inner_e}")
            raise HTTPException(status_code=422, detail=f"Failed to extract {label}: {inner_e}")

@app.post("/extract-embedding")
def extract_embedding(req: ExtractRequest):
    converter = get_converter_or_raise()
    
    if not os.path.exists(req.audio_path):
        raise HTTPException(status_code=400, detail=f"Reference audio file not found: {req.audio_path}")
        
    try:
        logging.info(f"Extracting embedding from reference audio: {req.audio_path}, synthetic: {req.is_synthetic}")
        if req.is_synthetic:
            se = get_se_synthetic(req.audio_path, converter)
        else:
            se = get_se_target_direct(req.audio_path, converter)
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(os.path.abspath(req.cache_path)), exist_ok=True)
        
        # Save as standard PyTorch serialized tensor
        torch.save(se, req.cache_path)
        logging.info(f"Speaker embedding saved to: {req.cache_path}")
        
        # Write metadata sidecar for staleness checking
        try:
            import json
            stat = os.stat(req.audio_path)
            meta_path = req.cache_path + ".meta.json"
            with open(meta_path, "w") as f:
                json.dump({"size": stat.st_size, "mtime": stat.st_mtime}, f)
        except Exception as meta_e:
            logging.warning(f"Failed to write meta sidecar for {req.cache_path}: {meta_e}")
        
        return {"status": "success", "embedding_cache_path": req.cache_path}
    except Exception as e:
        logging.error(f"Error in extract-embedding: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@app.post("/extract-source-embedding")
def extract_source_embedding(req: ExtractRequest):
    return extract_embedding(req)

@app.post("/convert")
def convert(req: ConvertRequest):
    converter = get_converter_or_raise()
    
    if not os.path.exists(req.source_audio_path):
        raise HTTPException(status_code=400, detail=f"Source audio file not found: {req.source_audio_path}")
        
    try:
        # 1. Resolve target speaker embedding (tgt_se)
        tgt_se = None
        if req.reference_embedding_path and os.path.exists(req.reference_embedding_path):
            cache_valid = True
            if req.reference_audio_path and os.path.exists(req.reference_audio_path):
                meta_path = req.reference_embedding_path + ".meta.json"
                if os.path.exists(meta_path):
                    try:
                        import json
                        with open(meta_path, "r") as f:
                            meta = json.load(f)
                        stat = os.stat(req.reference_audio_path)
                        if meta.get("size") != stat.st_size or meta.get("mtime") != stat.st_mtime:
                            logging.warning(f"Stale cache detected for {req.reference_embedding_path}. Re-extracting.")
                            cache_valid = False
                    except Exception as meta_e:
                        logging.warning(f"Failed to read meta sidecar: {meta_e}")
                else:
                    logging.warning(f"No meta sidecar found for {req.reference_embedding_path}. Proceeding with cached embedding.")
            
            if cache_valid:
                logging.info(f"Loading target embedding from cache: {req.reference_embedding_path}")
                tgt_se = torch.load(req.reference_embedding_path, map_location=device)

        if tgt_se is None:
            if req.reference_audio_path and os.path.exists(req.reference_audio_path):
                logging.info(f"Extracting target embedding on-the-fly from: {req.reference_audio_path}")
                tgt_se = get_se_target_direct(req.reference_audio_path, converter)
            else:
                raise HTTPException(
                    status_code=400, 
                    detail="Either a valid reference_embedding_path or reference_audio_path must be provided."
                )
            
        # 2. Extract source speaker embedding (src_se) from the source audio file
        # Use cached if provided
        if getattr(req, 'source_embedding_path', None) and os.path.exists(req.source_embedding_path):
            logging.info(f"Loading source embedding from cache: {req.source_embedding_path}")
            src_se = torch.load(req.source_embedding_path, map_location=device)
        else:
            logging.info(f"Extracting source embedding from chunk: {req.source_audio_path}")
            src_se = get_se_synthetic(req.source_audio_path, converter)
        
        # 3. Determine output path
        output_path = req.output_path
        if not output_path:
            base, ext = os.path.splitext(req.source_audio_path)
            output_path = f"{base}_cloned{ext}"
            
        # 4. Perform conversion
        logging.info(f"Converting voice: {req.source_audio_path} -> {output_path} with tau={req.tau}")
        audio_array = converter.convert(
            audio_src_path=req.source_audio_path,
            src_se=src_se,
            tgt_se=tgt_se,
            output_path=None,
            tau=req.tau
        )
        
        # OpenVoice V2 native sampling rate is typically 22050Hz
        native_sr = getattr(converter.hps.data, 'sampling_rate', 22050)
        target_sr = 24000
        
        import librosa
        import soundfile as sf
        
        if native_sr != target_sr:
            logging.info(f"Resampling output from {native_sr}Hz to {target_sr}Hz to prevent pitch-shift chipmunk effect")
            audio_array = librosa.resample(audio_array, orig_sr=native_sr, target_sr=target_sr)
            
        sf.write(output_path, audio_array, target_sr)
        
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("Generated output file is missing or 0 bytes.")
            
        info = sf.info(output_path)
        logging.info(f"[Diagnostics] Written WAV actual sample rate: {info.samplerate}Hz, channels: {info.channels}, duration: {info.duration:.3f}s")
        
        return {"status": "success", "converted_audio_path": output_path}
    except Exception as e:
        logging.error(f"Error in convert: {e}")
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

@app.get("/health")
def health():
    return {"status": "ok", "device": device, "model_loaded": (tone_color_converter is not None)}

if __name__ == "__main__":
    port = int(os.environ.get("VOICE_CLONE_PORT", 5001))
    uvicorn.run(app, host="127.0.0.1", port=port)
