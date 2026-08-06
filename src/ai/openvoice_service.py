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
import torch

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
    # Try the standard extractor with VAD disabled
    try:
        logging.info(f"[get_se_synthetic] Attempting standard extraction for {audio_path}")
        se, _ = se_extractor.get_se(audio_path, converter, vad=False)
        return se
    except Exception as e:
        logging.warning(f"[get_se_synthetic] Standard extraction failed, trying direct method: {e}")
        # If it fails, try a direct method if it exists
        if hasattr(converter, 'extract_se'):
            try:
                return converter.extract_se(audio_path)
            except Exception as direct_e:
                logging.error(f"[get_se_synthetic] Direct extraction failed: {direct_e}")

        # Final fallback to zero embedding
        logging.warning(f"[get_se_synthetic] Using neutral fallback embedding for {audio_path}")
        return torch.zeros(1, 256, 1, device=device)

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

def get_se_safe(audio_path, converter):
    """
    Robust speaker embedding extraction, attempting VAD first and falling back to non-VAD if needed.
    """
    try:
        logging.info(f"[get_se_safe] Converter methods: {dir(converter)}")
        se, _ = se_extractor.get_se(audio_path, converter, vad=True)
        logging.info(f"[get_se_safe] Successfully extracted embedding with shape: {se.shape}")
        return se
    except Exception as e:
        logging.warning(f"Embedding extraction with VAD failed for {audio_path}: {e}. Retrying with vad=False...")
        try:
            se, _ = se_extractor.get_se(audio_path, converter, vad=False)
            logging.info(f"[get_se_safe] Successfully extracted embedding with shape: {se.shape}")
            return se
        except Exception as inner_e:
            logging.warning(f"[get_se_safe] Using neutral fallback embedding for {audio_path} — no speech segments detected: {inner_e}")
            # Fallback to neutral zero embedding (assuming 256d based on OpenVoice V2 standard)
            fallback = torch.zeros(1, 256, 1, device=device)
            logging.info(f"[get_se_safe] Using fallback embedding with shape: {fallback.shape}")
            return fallback

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
            se = get_se_safe(req.audio_path, converter)
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(os.path.abspath(req.cache_path)), exist_ok=True)
        
        # Save as standard PyTorch serialized tensor
        torch.save(se, req.cache_path)
        logging.info(f"Speaker embedding saved to: {req.cache_path}")
        
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
        if req.reference_embedding_path and os.path.exists(req.reference_embedding_path):
            logging.info(f"Loading target embedding from cache: {req.reference_embedding_path}")
            tgt_se = torch.load(req.reference_embedding_path, map_location=device)
        elif req.reference_audio_path and os.path.exists(req.reference_audio_path):
            logging.info(f"Extracting target embedding on-the-fly from: {req.reference_audio_path}")
            tgt_se = get_se_safe(req.reference_audio_path, converter)
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
            src_se = get_se_safe(req.source_audio_path, converter)
        
        # 3. Determine output path
        output_path = req.output_path
        if not output_path:
            base, ext = os.path.splitext(req.source_audio_path)
            output_path = f"{base}_cloned{ext}"
            
        # 4. Perform conversion
        logging.info(f"Converting voice: {req.source_audio_path} -> {output_path}")
        converter.convert(
            audio_src_path=req.source_audio_path,
            src_se=src_se,
            tgt_se=tgt_se,
            output_path=output_path,
            tau=0.3
        )
        
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("Generated output file is missing or 0 bytes.")
            
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
