import sys
import numpy as np
import librosa
import warnings

warnings.filterwarnings("ignore")

def print_metrics(ref_path, cloned_path):
    print(f"Comparing Reference: {ref_path}")
    print(f"       to Cloned: {cloned_path}")
    
    try:
        ref_y, ref_sr = librosa.load(ref_path, sr=None)
        cloned_y, cloned_sr = librosa.load(cloned_path, sr=None)
        
        # Resample cloned if needed to match reference for fair comparison
        if ref_sr != cloned_sr:
            cloned_y = librosa.resample(cloned_y, orig_sr=cloned_sr, target_sr=ref_sr)
            cloned_sr = ref_sr
            
    except Exception as e:
        print(f"Error loading audio files: {e}")
        return

    def get_metrics(y, sr):
        # 1. F0
        f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'), sr=sr)
        f0_valid = f0[voiced_flag] if voiced_flag.any() else []
        f0_median = np.median(f0_valid) if len(f0_valid) > 0 else 0
        f0_mean = np.mean(f0_valid) if len(f0_valid) > 0 else 0
        
        # 2. Spectral Centroid
        centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        
        # 3. Spectral Rolloff
        rolloff = np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))
        
        # 4. Spectral Flatness
        flatness = np.mean(librosa.feature.spectral_flatness(y=y))
        
        # 5. RMS
        rms = np.mean(librosa.feature.rms(y=y))
        
        return {
            "F0 Median (Hz)": f0_median,
            "F0 Mean (Hz)": f0_mean,
            "Spectral Centroid": centroid,
            "Spectral Rolloff": rolloff,
            "Spectral Flatness": flatness,
            "RMS Energy": rms
        }
        
    ref_metrics = get_metrics(ref_y, ref_sr)
    cloned_metrics = get_metrics(cloned_y, cloned_sr)
    
    print(f"\n{'-'*75}")
    print(f"{'Metric':<20} | {'Reference':<12} | {'Cloned':<12} | {'Abs Diff':<10} | {'% Diff'}")
    print(f"{'-'*75}")
    
    for k in ref_metrics:
        v_ref = ref_metrics[k]
        v_cloned = cloned_metrics[k]
        diff = abs(v_cloned - v_ref)
        pct = (diff / v_ref * 100) if v_ref != 0 else 0
        
        print(f"{k:<20} | {v_ref:<12.4f} | {v_cloned:<12.4f} | {diff:<10.4f} | {pct:.2f}%")
        
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python debug_voice_compare.py <reference_audio_path> <cloned_output_path>")
        sys.exit(1)
    print_metrics(sys.argv[1], sys.argv[2])
