/**
 * audio.js — MathCrush sound engine
 * Uses Web Audio API with a dynamics compressor to keep volume loud but clean.
 * All functions are globally available (no module bundler needed).
 */

const AC = new (window.AudioContext || window.webkitAudioContext)();

// Compressor prevents clipping at high volumes
const compressor = AC.createDynamicsCompressor();
compressor.threshold.value = -6;
compressor.knee.value      = 3;
compressor.ratio.value     = 4;
compressor.attack.value    = 0.002;
compressor.release.value   = 0.1;
compressor.connect(AC.destination);

/** Resume audio context after a user gesture (browser autoplay policy). */
function resumeAC() {
  if (AC.state === 'suspended') AC.resume();
}

/**
 * Play a single synthesised tone.
 * @param {number} freq    - Frequency in Hz
 * @param {string} type    - OscillatorType: 'sine' | 'triangle' | 'sawtooth' | 'square'
 * @param {number} dur     - Duration in seconds (release tail)
 * @param {number} vol     - Peak gain (0–1)
 * @param {number} attack  - Attack time in seconds
 */
function playTone(freq, type, dur, vol = 0.55, attack = 0.01) {
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.connect(g);
  g.connect(compressor);
  o.type = type;
  o.frequency.setValueAtTime(freq, AC.currentTime);
  g.gain.setValueAtTime(0, AC.currentTime);
  g.gain.linearRampToValueAtTime(vol, AC.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
  o.start();
  o.stop(AC.currentTime + dur + 0.05);
}

// ── Named sound effects ───────────────────────────────────────────────────────

function playClick() {
  playTone(600, 'sine', 0.09, 0.5, 0.005);
}

function playDeselect() {
  playTone(350, 'sine', 0.07, 0.4, 0.005);
}

function playCorrect() {
  // Rising chord arpeggio
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => playTone(f, 'sine', 0.25, 0.6, 0.01), i * 65)
  );
}

function playWrong() {
  // Descending dissonant buzz
  playTone(160, 'sawtooth', 0.18, 0.55, 0.01);
  setTimeout(() => playTone(120, 'sawtooth', 0.22, 0.45, 0.01), 90);
}

function playLevelUp() {
  // Full ascending fanfare
  [523, 659, 784, 1047, 1319].forEach((f, i) =>
    setTimeout(() => playTone(f, 'sine', 0.4, 0.65, 0.01), i * 80)
  );
}

function playGameOver() {
  // Descending sad tones
  [440, 370, 311, 262].forEach((f, i) =>
    setTimeout(() => playTone(f, 'sawtooth', 0.35, 0.5, 0.01), i * 110)
  );
}

/**
 * Play a tile-select note pitched to the tile's numeric value.
 * Values 2–20 map to musical notes across two octaves.
 * @param {number} val - The tile's numeric value (0 for operator tiles)
 */
function playTileSelect(val) {
  const freqs = [
    0, 0,         // indices 0–1 unused
    440, 466, 494, 523, 554, 587, 622, 659,   // 2–9
    698, 740, 784, 831, 880, 932, 988,         // 10–16
    1047, 1109, 1175, 1245                     // 17–20
  ];
  const freq = freqs[Math.min(val, 20)] || 500;
  playTone(freq, 'triangle', 0.12, 0.5, 0.005);
}
