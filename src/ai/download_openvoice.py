from huggingface_hub import snapshot_download
import os, sys, logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s', stream=sys.stderr)

TARGET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CHECKPOINT_DIR = os.path.join(TARGET_DIR, "checkpoints_v2")

def main():
    expected_pth = os.path.join(CHECKPOINT_DIR, "converter", "checkpoint.pth")
    if os.path.exists(expected_pth):
        logging.info("OpenVoice V2 checkpoints already exist. Skipping download.")
        return
    try:
        logging.info("Downloading OpenVoice V2 checkpoints from Hugging Face (myshell-ai/OpenVoiceV2)...")
        snapshot_download(
            repo_id="myshell-ai/OpenVoiceV2",
            local_dir=CHECKPOINT_DIR,
            local_dir_use_symlinks=False,
            allow_patterns=["converter/*", "base_speakers/*"]
        )
        if not os.path.exists(expected_pth):
            raise FileNotFoundError(f"Expected checkpoint not found after download: {expected_pth}")
        logging.info("OpenVoice V2 checkpoints successfully set up.")
    except Exception as e:
        logging.error(f"Failed to download OpenVoice V2 checkpoints from Hugging Face: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
