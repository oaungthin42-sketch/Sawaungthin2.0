import os
import sys
import zipfile
import requests
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s', stream=sys.stderr)

CHECKPOINT_URL = "https://myshell-public-repo-hosting.s3.amazonaws.com/openvoice/checkpoints_v2_0417.zip"
TARGET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CHECKPOINT_DIR = os.path.join(TARGET_DIR, "checkpoints_v2")

def main():
    expected_pth = os.path.join(CHECKPOINT_DIR, "converter", "checkpoint.pth")
    if os.path.exists(expected_pth):
        logging.info("OpenVoice V2 checkpoints already exist. Skipping download.")
        return

    logging.info(f"Downloading OpenVoice V2 checkpoints from {CHECKPOINT_URL}...")
    zip_path = os.path.join(TARGET_DIR, "checkpoints_v2.zip")
    
    try:
        response = requests.get(CHECKPOINT_URL, stream=True)
        response.raise_for_status()
        
        with open(zip_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    
        logging.info("Download complete. Extracting zip archive...")
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(TARGET_DIR)
            
        logging.info("Extraction complete. Cleaning up zip file...")
        if os.path.exists(zip_path):
            os.remove(zip_path)
            
        logging.info("OpenVoice V2 checkpoints successfully set up.")
    except Exception as e:
        logging.error(f"Failed to download or extract OpenVoice V2 checkpoints: {e}")
        if os.path.exists(zip_path):
            os.remove(zip_path)
        sys.exit(1)

if __name__ == "__main__":
    main()
