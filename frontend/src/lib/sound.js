let actx = null;

function tone(freq, dur, type) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, actx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + dur + 0.02);
  } catch { /* audio unavailable */ }
}

export function beepHit() {
  tone(1240, 0.07, 'triangle');
  if (navigator.vibrate) navigator.vibrate(35);
}

export function beepMiss() {
  tone(220, 0.2, 'sawtooth');
  if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
}
