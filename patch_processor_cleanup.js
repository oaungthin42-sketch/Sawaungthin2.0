import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const target = `    } catch (err) {
        console.error(\`[Job \${jobId}] Error:\`, err);
        const safeErrorMsg = err.message ? err.message.replace(/key=[A-Za-z0-9_\\-]+/gi, 'key=HIDDEN') : 'Unknown error';
        updateJob(jobId, { status: 'error', error: safeErrorMsg });
    } finally {
        // ALWAYS CLEANUP
        advanceStep(STEPS.CLEANUP, 100, 'Cleaning up temporary files');`;

const replacement = `    } catch (err) {
        console.error(\`[Job \${jobId}] Error:\`, err);
        const safeErrorMsg = err.message ? err.message.replace(/key=[A-Za-z0-9_\\-]+/gi, 'key=HIDDEN') : 'Unknown error';
        updateJob(jobId, { status: 'error', error: safeErrorMsg });
    } finally {
        // ALWAYS CLEANUP
        const currentJob = getJob(jobId);
        if (currentJob && currentJob.status !== 'complete' && currentJob.status !== 'error') {
            advanceStep(STEPS.CLEANUP, 100, 'Cleaning up temporary files');
        }`;

if (content.includes("advanceStep(STEPS.CLEANUP, 100, 'Cleaning up temporary files');")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Patched processor cleanup successfully.");
} else {
    console.log("Target not found.");
}
