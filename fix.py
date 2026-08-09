content = """import os
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

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')"""

with open('src/ai/openvoice_service.py', 'r') as f:
    text = f.read()

index = text.find("# Import OpenVoice API")
rest = text[index:]

with open('src/ai/openvoice_service.py', 'w') as f:
    f.write(content + "\n" + rest)
