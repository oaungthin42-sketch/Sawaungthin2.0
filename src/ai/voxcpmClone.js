import { Client, handle_file } from "@gradio/client";
import fs from "fs";
import path from "path";

export async function generateVoxCPMSpeech(text, referenceAudioPath, outputPath) {
    console.log(`[VoxCPM] Starting voice clone generation for text: "${text.substring(0, 30)}..."`);
    
    let attempt = 0;
    const maxAttempts = 5;

    while (attempt < maxAttempts) {
        try {
            attempt++;
            console.log(`[VoxCPM] Connecting to openbmb/VoxCPM-Demo (Attempt ${attempt}/${maxAttempts})...`);
            const app = await Client.connect("openbmb/VoxCPM-Demo");
            
            console.log(`[VoxCPM] Reading reference audio from: ${referenceAudioPath}`);
            const audioFile = new File([fs.readFileSync(referenceAudioPath)], path.basename(referenceAudioPath), { type: 'audio/wav' });

            console.log(`[VoxCPM] Calling predict endpoint...`);
            const result = await app.predict("/generate", [
                text,
                "",
                handle_file(audioFile),
                false,
                "",
                2,
                false,
                false
            ]);

            console.log(`[VoxCPM] Predict returned successfully. Extracting audio...`);
            
            if (!result.data || !result.data[0] || !result.data[0].url) {
                throw new Error("Invalid response from VoxCPM: missing audio URL.");
            }

            const audioUrl = result.data[0].url;
            console.log(`[VoxCPM] Downloading generated audio from: ${audioUrl}`);
            
            const response = await fetch(audioUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
            
            console.log(`[VoxCPM] Successfully wrote cloned audio to: ${outputPath}`);
            return true;

        } catch (error) {
            const errorMsg = error.message || error.toString();
            console.error(`[VoxCPM] Error on attempt ${attempt}:`, errorMsg);
            
            if (attempt >= maxAttempts) {
                console.error(`[VoxCPM] Max attempts reached. Failing permanently.`);
                throw error;
            }

            const isColdStart = errorMsg.includes("Could not resolve app config") ||
                                errorMsg.includes("206");

            const isTransient = isColdStart ||
                                errorMsg.includes("temporarily unstable") ||
                                errorMsg.includes("busy") ||
                                errorMsg.includes("fetch failed");

            if (isColdStart) {
                console.log(`[VoxCPM] Cold-start detected (HF Space waking up). Waiting 30 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            } else if (isTransient) {
                console.log(`[VoxCPM] Transient error detected. Waiting 10 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                console.error(`[VoxCPM] Non-transient error. Failing immediately.`);
                throw error;
            }
        }
    }
}
