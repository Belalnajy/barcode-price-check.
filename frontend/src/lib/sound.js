/* Scanner feedback: a short tone + haptic per outcome. Silently no-ops when
   the browser blocks audio (no user gesture yet, autoplay policy, iOS mute). */

const KEY = 'sound';
let ctx = null;
let muted = read();

function read() {
  try { return localStorage.getItem(KEY) === 'off'; } catch { return false; }
}

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = next;
  try { localStorage.setItem(KEY, next ? 'off' : 'on'); } catch { /* ignore */ }
}

function context() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** One enveloped note. `at` offsets it so notes can be chained into a chirp. */
function note(ac, { freq, dur, type = 'sine', gain = 0.13, at = 0 }) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // Exponential ramps can't touch zero, hence the tiny floor values.
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function play(notes) {
  if (muted) return;
  try {
    const ac = context();
    if (ac) notes.forEach((n) => note(ac, n));
  } catch { /* audio unavailable */ }
}

function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ }
}

/** Found, priced — a crisp rising two-note chirp. */
export function beepHit() {
  play([
    { freq: 1046, dur: 0.05, type: 'triangle', gain: 0.11 },
    { freq: 1568, dur: 0.07, type: 'triangle', gain: 0.1, at: 0.045 },
  ]);
  buzz(30);
}

/** Found, but no price recorded — a flat mid tone, clearly not a success. */
export function beepWarn() {
  play([
    { freq: 660, dur: 0.09, type: 'triangle', gain: 0.12 },
    { freq: 660, dur: 0.11, type: 'triangle', gain: 0.1, at: 0.13 },
  ]);
  buzz([25, 60, 25]);
}

/** Not in the catalog — a low descending buzz. */
export function beepMiss() {
  play([
    { freq: 300, dur: 0.1, type: 'sawtooth', gain: 0.09 },
    { freq: 190, dur: 0.18, type: 'sawtooth', gain: 0.09, at: 0.08 },
  ]);
  buzz([45, 55, 45]);
}
