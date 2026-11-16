import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { edgeTtsToFile } from './edgeTtsPy.js';
import { runFFmpeg } from '../ffmpeg/index.js';

const parseSignedNumber = (val) => {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val !== 'string') return 0;
    const match = val.match(/([+-]?\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
};

const decodeErrorData = (data) => {
    if (!data) return '';
    try {
        const text = Buffer.isBuffer(data)
            ? data.toString('utf8')
            : (data instanceof ArrayBuffer || ArrayBuffer.isView(data))
                ? Buffer.from(data.buffer || data).toString('utf8')
                : typeof data === 'string'
                    ? data
                    : JSON.stringify(data);
        try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.error) return String(parsed.error);
        } catch (_) {}
        return text.trim();
    } catch (_) {
        return '';
    }
};

export const synthesizeToFile = async (text, voiceConfig, outPath, timeoutMs = 30000) => {
    if (!voiceConfig || voiceConfig.engine !== 'nara') {
        return edgeTtsToFile(
            text,
            {
                voice: voiceConfig?.edgeVoice,
                rate: voiceConfig?.rate,
                pitch: voiceConfig?.pitch
            },
            outPath,
            timeoutMs
        );
    }

    const naraBaseUrl = process.env.NARA_API_URL;
    if (!naraBaseUrl || !naraBaseUrl.trim()) {
        throw new Error('NARA_API_URL is not configured');
    }

    const endpoint = `${naraBaseUrl.trim().replace(/\/+$/, '')}/tts`;
    const tempWavPath = `${outPath}.nara.wav`;

    let response;
    try {
        response = await axios.post(
            endpoint,
            {
                text,
                voice: voiceConfig.naraVoice
            },
            {
                responseType: 'arraybuffer',
                timeout: timeoutMs,
                validateStatus: () => true
            }
        );
    } catch (err) {
        const detail = decodeErrorData(err.response?.data) || err.message;
        const statusPart = err.response?.status ? `HTTP ${err.response.status}: ` : '';
        throw new Error(`Nara TTS request failed (${statusPart}${detail})`);
    }

    if (response.status !== 200) {
        const detail = decodeErrorData(response.data) || response.statusText || 'Unknown error';
        throw new Error(`Nara TTS failed (HTTP ${response.status}): ${detail}`);
    }

    const wavBuffer = Buffer.from(response.data);
    if (!wavBuffer || wavBuffer.length === 0) {
        throw new Error('Nara TTS returned empty audio buffer');
    }

    try {
        fs.writeFileSync(tempWavPath, wavBuffer);

        const rateNum = parseSignedNumber(voiceConfig.rate);
        const pitchNum = parseSignedNumber(voiceConfig.pitch);

        const filters = [];
        const semitones = pitchNum * 0.06;
        if (Math.abs(semitones) > 0.01) {
            const f = Math.pow(2, semitones / 12);
            const scaledRate = (24000 * f).toFixed(2);
            const invF = (1 / f).toFixed(6);
            filters.push(`asetrate=${scaledRate},aresample=24000,atempo=${invF}`);
        }

        if (rateNum !== 0) {
            const s = Math.min(2.0, Math.max(0.5, 1 + rateNum / 100));
            filters.push(`atempo=${s.toFixed(4)}`);
        }

        const ffmpegArgs = ['-y', '-i', tempWavPath];
        if (filters.length > 0) {
            ffmpegArgs.push('-af', filters.join(','));
        }
        ffmpegArgs.push(
            '-acodec', 'libmp3lame',
            '-ac', '1',
            '-ar', '24000',
            '-b:a', '96k',
            outPath
        );

        await runFFmpeg(ffmpegArgs, path.dirname(outPath));
        return outPath;
    } finally {
        try {
            if (fs.existsSync(tempWavPath)) {
                fs.unlinkSync(tempWavPath);
            }
        } catch (_) {}
    }
};
