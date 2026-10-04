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
`strobe-worklet.js` takes the place of the spinning disc in a mechanical strobe tuner:

- It mixes the input with a reference oscillator at the target frequency f0 and its multiples 2f0, 4f0, 8f0 (octaves) (quadrature heterodyne), then low-pass filters the result.
- The phase of the resulting baseband signal rotates at 2π·k·(f − f0), which is the same as the "disc position".
- Each band draws a pattern with period L/k, shifted by that phase, so every band moves at the same speed. Brightness follows the strength of that partial.
- All phases received within one display frame are averaged and drawn together. This reproduces the smear a real strobe shows when the pattern moves fast.
- The cent readout comes from a least-squares fit of the unwrapped phase over the last 0.35 s.
- Automatic note selection uses YIN pitch detection, with hysteresis.

## Publishing (other than GitHub)
Upload `index.html` and `strobe-worklet.js` together to any static host that serves HTTPS.
- Netlify Drop (https://app.netlify.com/drop): drag the folder or zip onto the page
- Cloudflare Pages: Workers & Pages → Create → Pages → Upload assets
