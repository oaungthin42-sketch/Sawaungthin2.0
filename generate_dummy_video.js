import { spawn } from 'child_process';

const args = [
    '-f', 'lavfi',
    '-i', 'color=c=blue:s=640x360:d=300',
    '-f', 'lavfi',
    '-i', 'aevalsrc=0:d=300',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-c:a', 'aac',
    'dummy_5min.mp4'
];

const child = spawn('ffmpeg', args);
child.stdout.on('data', d => console.log(d.toString()));
child.stderr.on('data', d => console.log(d.toString()));
child.on('close', code => console.log('Done with code', code));
