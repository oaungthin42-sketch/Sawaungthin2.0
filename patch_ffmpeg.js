import fs from 'fs';

let content = fs.readFileSync('src/ffmpeg/index.js', 'utf8');

const target = `export const runFFmpeg = (args, cwd, onProgress, timeoutMs = 600000) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(cwd)) {
            return reject(new Error(\`CWD does not exist: \${cwd}\`));
        }
        console.log(\`[FFmpeg] Running command: ffmpeg \${args.join(' ')}\`);
        const child = spawn(ffmpegPath, args, { cwd });
        
        let timeoutTimer = null;
        if (timeoutMs) {
            timeoutTimer = setTimeout(() => {
                console.error(\`[FFmpeg] Timeout reached (\${timeoutMs}ms), killing process...\`);
                child.kill('SIGKILL');
                reject(new Error(\`FFmpeg timed out after \${timeoutMs}ms.\`));
            }, timeoutMs);
        }

        let duration = 0;
        let lastErrorOutput = '';
        
        child.stderr.on('data', (data) => {
            const str = data.toString();
            lastErrorOutput += str;
            if (onProgress) {
                // Parse duration for progress
                const durMatch = str.match(/Duration: ([0-9]{2}):([0-9]{2}):([0-9]{2}\\.[0-9]+)/);
                if (durMatch) {
                    duration = (parseInt(durMatch[1]) * 3600) + (parseInt(durMatch[2]) * 60) + parseFloat(durMatch[3]);
                }
                const timeMatch = str.match(/time=([0-9]{2}):([0-9]{2}):([0-9]{2}\\.[0-9]+)/);
                if (timeMatch && duration > 0) {
                    const time = (parseInt(timeMatch[1]) * 3600) + (parseInt(timeMatch[2]) * 60) + parseFloat(timeMatch[3]);
                    const progress = Math.min(100, Math.max(0, (time / duration) * 100));
                    onProgress(progress);
                }
            }
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                console.error(\`[FFmpeg] Failed with code \${code}. Error: \${lastErrorOutput}\`);
                reject(new Error(\`FFmpeg exited with code \${code}. Log: \${lastErrorOutput}\`));
            }
        });

        child.on('error', (err) => {
            
            console.error(\`[FFmpeg] Process error:\`, err);
            reject(err);
        });
    });
};`;

const replacement = `export const runFFmpeg = (args, cwd, onProgress, timeoutMs = 600000) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(cwd)) {
            return reject(new Error(\`CWD does not exist: \${cwd}\`));
        }
        console.log(\`[FFmpeg] Running command: ffmpeg \${args.join(' ')}\`);
        const child = spawn(ffmpegPath, args, { cwd });
        
        let timeoutTimer = null;
        let settled = false;

        const finish = (error) => {
            if (settled) return;
            settled = true;
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        if (timeoutMs) {
            timeoutTimer = setTimeout(() => {
                console.error(\`[FFmpeg] Timeout reached (\${timeoutMs}ms), killing process...\`);
                child.kill('SIGKILL');
                finish(new Error(\`FFmpeg timed out after \${timeoutMs}ms.\`));
            }, timeoutMs);
        }

        let duration = 0;
        let lastErrorOutput = '';
        
        child.stderr.on('data', (data) => {
            const str = data.toString();
            lastErrorOutput += str;
            if (onProgress) {
                const durMatch = str.match(/Duration: ([0-9]{2}):([0-9]{2}):([0-9]{2}\\.[0-9]+)/);
                if (durMatch) {
                    duration = (parseInt(durMatch[1]) * 3600) + (parseInt(durMatch[2]) * 60) + parseFloat(durMatch[3]);
                }
                const timeMatch = str.match(/time=([0-9]{2}):([0-9]{2}):([0-9]{2}\\.[0-9]+)/);
                if (timeMatch && duration > 0) {
                    const time = (parseInt(timeMatch[1]) * 3600) + (parseInt(timeMatch[2]) * 60) + parseFloat(timeMatch[3]);
                    const progress = Math.min(100, Math.max(0, (time / duration) * 100));
                    onProgress(progress);
                }
            }
        });

        child.on('close', (code) => {
            if (code === 0) {
                finish();
            } else {
                const limitLog = lastErrorOutput.length > 500 ? lastErrorOutput.substring(lastErrorOutput.length - 500) : lastErrorOutput;
                console.error(\`[FFmpeg] Failed with code \${code}. Error: \${limitLog}\`);
                finish(new Error(\`FFmpeg exited with code \${code}. Log: \${limitLog}\`));
            }
        });

        child.on('error', (err) => {
            console.error(\`[FFmpeg] Process error:\`, err);
            finish(err);
        });
    });
};`;

if (content.includes("export const runFFmpeg")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ffmpeg/index.js', content);
    console.log("Patched runFFmpeg successfully.");
} else {
    console.log("Target not found.");
}
