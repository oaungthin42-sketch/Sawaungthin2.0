import { createJob, getJob, updateJob } from './src/services/jobManager.js';
import path from 'path';
import fs from 'fs';
import { runFFmpeg } from './src/ffmpeg/index.js';
// We'll spawn the actual worker and give it a mock video. Wait, we can't easily mock AssemblyAI inside the worker unless we modify src/ai/index.js temporarily.
