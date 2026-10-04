# Strobe Tuner (Web)

A strobe tuner that runs in the browser. Built for iPad Safari.

## How to use
1. Open `index.html` over **HTTPS**, e.g. on GitHub Pages. The mic can't be used from `file://` or plain HTTP.
2. Tap "マイク開始" (Start mic) and allow microphone access.
3. Stripes drifting right = sharp, drifting left = flat, stopped = in tune.

- **自動 / 手動 (Auto / Manual)**: Auto picks the nearest note from the sound. Manual locks the target note with ◀ ▶.
- **基準音 (Reference tone)**: plays the target note. You can set the volume and waveform.
- **A4**: sets the reference frequency (400–480 Hz). One tap = 0.1 Hz, hold for 1 Hz steps.
- **感度 (Sensitivity)**: the input level at which the display starts reacting.

## How it works
The AudioWorklet inside `index.html` (`script#worklet-src`) takes the place of the spinning disc in a mechanical strobe tuner:

- It mixes the input with a reference oscillator at the target frequency f0 and its multiples 2f0, 4f0, 8f0 (octaves) (quadrature heterodyne), then low-pass filters the result.
- The phase of the resulting baseband signal rotates at 2π·k·(f − f0), which is the same as the "disc position".
- Each band draws a pattern with period L/k, shifted by that phase, so every band moves at the same speed. Brightness follows the strength of that partial.
- All phases received within one display frame are averaged and drawn together. This reproduces the smear a real strobe shows when the pattern moves fast.
- The cent readout comes from a least-squares fit of the unwrapped phase over the last 0.35 s.
- Automatic note selection uses YIN pitch detection, with hysteresis.

## Beyond the strobe
- **Harmonic fusion + inharmonicity correction**: fits each partial's deviation c_k with c_k = c0 + 865.6·B·(k²−1) (weighted least squares), estimating the fundamental's tuning c0 and the string's stiffness B separately. Stops the higher partials of piano or bass strings from pulling the reading sharp.
- **Kalman filter**: smooths each measurement weighted by its standard error. A large jump (a peg turn) resets the filter, so the reading follows it immediately.
- **Adaptive bandwidth**: once within ±6¢ for 0.5 s, the demodulation filter narrows from 0.2·f0 to 0.07·f0 and the analysis window lengthens from 0.35 s to 0.6 s, lowering noise.
- **Attack rejection**: ignores the first 0.12 s after a pluck (sharp and noisy).
- **Display**: cents per harmonic, stability (spread over 1 s), an 8-second history graph, and ♯/♭ notation (tap the note name to switch).

## Tuba mode (Settings → Instrument → Tuba)
- **8-harmonic fusion**: measures harmonics 1–8 and combines them by precision, so it reads accurately even when the fundamental barely reaches a small mic (B♭1 = 58 Hz and below). Wind instruments sustain their tone, so the harmonics are exactly harmonic and no inharmonicity correction is applied.
- **Tuning-slide guide**: pulling the main slide out by x lengthens the tube by 2x. With the acoustic length L = v / (2·f_pedal), shows in mm how far to pull out or push in (theoretical value ≈ 0.59 ¢/mm on a B♭ tuba). "管の感度 → 記録" (slide sensitivity → record) measures it on your instrument: record the same note before and after pulling the slide a known distance.
- **Resonance-center detection (experimental)**: uses the natural pitch wobble while playing. Pitch (from phase over 70 ms) and level (input RMS, aligned by the filter's group delay) are high-passed at about 0.7 s to remove breath swells, then the slope s of ln(level) against pitch is measured. Since ln A ≈ a − (c − c_r)²/w² near the resonance peak, the offset from the center is estimated as c − c_r = −s·w²/2 (w = 35¢). With this correction on, the slide guide uses the instrument's own pitch rather than the pitch forced with the lips.
- German note names (C, Cis, D, Es … B, H); the demo produces a synthetic B♭1 tuba tone.

Synthetic-signal check (weak fundamental, noise added): true −10¢ → about −10 average (varies ±4–5), +8¢ → +7 to +9, 0¢ → reported as "at the center".

## Files and publishing
- `index.html`: the whole tuner in one file (works on its own, including the audio processing)
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: for offline use and adding to the home screen (optional)

Upload these files to any static host that serves HTTPS: GitHub Pages, Cloudflare Pages (`*.pages.dev`), Netlify, and so on.
Once you open it on a site and add it to the home screen, it keeps working with no network.
On a PC, `index.html` can also be opened directly in Chrome or Edge (the mic works).
