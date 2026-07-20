import os

with open('src/ai/transcribe.py', 'r') as f:
    content = f.read()

dummy_replacement = """                # Dummy output for local preview
                dummy = []
                for i in range(70):
                    dummy.append({
                        "timestamp": [i * 5.0, i * 5.0 + 4.0],
                        "text": f"This is test sentence number {i}. The quick brown fox jumps over the lazy dog."
                    })
"""

content = content.replace(
"""                # Dummy output for local preview
                dummy = [
                    {"timestamp": [0.0, 2.0], "text": "This is a dummy transcription."},
                    {"timestamp": [2.0, 4.0], "text": "Because faster-whisper is not installed locally."}
                ]""", dummy_replacement
)

with open('src/ai/transcribe.py', 'w') as f:
    f.write(content)
