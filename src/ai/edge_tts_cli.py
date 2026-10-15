import asyncio
import json
import sys

import edge_tts


async def main():
    voice, rate, pitch, text_path, out_path = sys.argv[1:6]
    with open(text_path, "r", encoding="utf-8") as f:
        text = f.read()

    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    parts = []
    with open(out_path, "wb") as out:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                out.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                start_ms = chunk["offset"] / 10000.0
                dur_ms = chunk["duration"] / 10000.0
                parts.append({
                    "part": chunk["text"],
                    "start": int(round(start_ms)),
                    "end": int(round(start_ms + dur_ms)),
                })

    with open(out_path + ".json", "w", encoding="utf-8") as jf:
        json.dump(parts, jf, ensure_ascii=False)


if __name__ == "__main__":
    asyncio.run(main())
