import re

with open('src/ai/index.js', 'r') as f:
    content = f.read()

# We need to find where authoritativeTimeline is populated.
old_code = """
            authoritativeTimeline.push({
                chunk_index: i,
                orig_start: orig_start,
                orig_end: orig_end,
                orig_dur: orig_dur,
                final_audio_start: runningAudioTime + actualGapBefore,
                final_audio_end: runningAudioTime + actualGapBefore + actualFinalDur,
                final_dur: actualFinalDur,
                text: translatedTranscript[i] ? translatedTranscript[i].text : ""
            });
"""

new_code = """
            let adjusted_orig_end = orig_end;
            let adjusted_orig_dur = orig_dur;
            // If the audio is shorter than the video, the video should play at normal speed.
            // The remaining original video time becomes a gap.
            if (orig_dur > 0 && actualFinalDur < orig_dur) {
                adjusted_orig_dur = actualFinalDur;
                adjusted_orig_end = orig_start + adjusted_orig_dur;
            }

            authoritativeTimeline.push({
                chunk_index: i,
                orig_start: orig_start,
                orig_end: adjusted_orig_end,
                orig_dur: adjusted_orig_dur,
                final_audio_start: runningAudioTime + actualGapBefore,
                final_audio_end: runningAudioTime + actualGapBefore + actualFinalDur,
                final_dur: actualFinalDur,
                text: translatedTranscript[i] ? translatedTranscript[i].text : ""
            });
"""

if "chunk_index: i," in content:
    content = content.replace(old_code.strip(), new_code.strip())
    with open('src/ai/index.js', 'w') as f:
        f.write(content)
    print("Replaced!")
else:
    print("Not found")
