import fs from 'fs';
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const searchStr3 = `            if (current_time < state.audioDuration) {
                const lastChunk = authTimeline[authTimeline.length - 1];
                let sEnd = lastChunk ? lastChunk.orig_end : state.originalVideoDuration;
                createTimelineSegment(current_time, state.audioDuration, sEnd, state.originalVideoDuration, "[Silence]");
            }`;

if (content.includes(searchStr3)) {
    console.log("Found searchStr3");
} else {
    console.log("Could NOT find searchStr3");
}
