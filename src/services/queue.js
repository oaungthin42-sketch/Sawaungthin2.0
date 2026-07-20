import PQueue from 'p-queue';
import { processRecapPipeline } from '../workers/processor.js';
import { updateJob } from './jobManager.js';

// Limit to 1 concurrency to save memory on 2GB RAM Railway
const queue = new PQueue({ concurrency: 1 });

export const addJobToQueue = (jobId) => {
    queue.add(async () => {
        try {
            await processRecapPipeline(jobId);
        } catch (error) {
            console.error(`[Queue] Job ${jobId} failed:`, error);
            updateJob(jobId, { status: 'error', error: error.message });
        }
    });
};
