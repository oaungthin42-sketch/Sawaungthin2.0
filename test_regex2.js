import fs from 'fs';
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const searchStr2 = `            for (let i = 0; i < authTimeline.length; i++) {
                const chunk = authTimeline[i];
                let c_start = chunk.final_audio_start;
                let c_end = chunk.final_audio_end;
                
                if (c_start > current_time) {
                    // Gap
                    let gap_scene_start = i > 0 ? authTimeline[i-1].orig_end : 0;
                    let gap_scene_end = chunk.orig_start;
                    if (gap_scene_end < gap_scene_start) gap_scene_end = gap_scene_start + 0.1;
                    createTimelineSegment(current_time, c_start, gap_scene_start, gap_scene_end, "[Silence]");
                }
                
                createTimelineSegment(c_start, c_end, chunk.orig_start, chunk.orig_end, chunk.text);
                
                current_time = c_end;
                
                state.mapping.push({`;

if (content.includes(searchStr2)) {
    console.log("Found searchStr2");
} else {
    console.log("Could NOT find searchStr2");
}
