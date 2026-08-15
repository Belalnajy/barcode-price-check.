/**
 * Camera barcode scanning with two backends:
 *
 *  1. `BarcodeDetector` — built into Chrome/Android. Nothing to download and
 *     decoding happens natively, so it is both faster and far lighter.
 *  2. `html5-qrcode` — lazy-loaded only when the native API is missing
 *     (Safari, Firefox). ~330 KB that most phones now never fetch.
 *
 * Scanning is continuous: the camera stays open and keeps reporting codes
 * until the caller stops it, so a whole basket can be scanned in one go.
 */

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
const SAMPLE_MS = 120;

/* A code has to be read this many times in a row before it counts — a misread
   that quotes the wrong price to a customer is worse than aiming again. */
const CONFIRMATIONS = 2;
/* Frames with nothing in view before the same code may be scanned again. */
const CLEAR_AFTER_IDLE = 4;
/* Floor on repeats, so one dropped frame can't double-add an item. */
const MIN_REPEAT_MS = 900;

export function hasNativeDetector() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Turns a noisy per-frame stream of reads into clean "this was scanned" events:
 * requires consecutive agreement, then holds that code back until the item
 * actually leaves the frame.
 */
function reader(onDetect, now = () => Date.now()) {
  let last = null;
  let streak = 0;
  let held = null;
  let heldAt = 0;
  let idle = 0;

  return {
    saw(value) {
      if (!value) return;
      idle = 0;
      if (value === last) streak += 1;
      else { last = value; streak = 1; }
      if (streak < CONFIRMATIONS) return;

      // Still looking at the item we just added — don't add it again.
      if (value === held && now() - heldAt < MIN_REPEAT_MS) return;
      if (value === held) return;

      held = value;
      heldAt = now();
      last = null;
      streak = 0;
      onDetect(value);
    },
    /** Called for frames where no barcode was found. */
    nothing() {
      idle += 1;
      if (idle >= CLEAR_AFTER_IDLE) {
        held = null;
        last = null;
        streak = 0;
      }
    },
  };
}

async function startNative(container, onDetect) {
  const supported = await window.BarcodeDetector.getSupportedFormats();
  const formats = FORMATS.filter((f) => supported.includes(f));
  if (!formats.length) throw Object.assign(new Error('no_formats'), { code: 'no_formats' });

  const detector = new window.BarcodeDetector({ formats });
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  const video = document.createElement('video');
  video.className = 'cam-video';
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  container.appendChild(video);

  let stopped = false;
  let timer = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
    video.remove();
  };

  const read = reader(onDetect);

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        if (codes.length) read.saw(String(codes[0].rawValue || '').trim());
        else read.nothing();
      }
    } catch {
      /* transient decode failures are normal while the frame is in motion */
    }
    if (!stopped) timer = setTimeout(tick, SAMPLE_MS);
  };

  try {
    await video.play();
  } catch (e) {
    stop();
    throw e;
  }
  tick();

  return stop;
}

async function startFallback(container, onDetect) {
  const { Html5Qrcode } = await import('html5-qrcode');

  const mount = document.createElement('div');
  mount.id = `reader-${Math.random().toString(36).slice(2, 9)}`;
  container.appendChild(mount);

  const scanner = new Html5Qrcode(mount.id, { verbose: false });
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    Promise.resolve()
      .then(() => scanner.stop())
      .then(() => scanner.clear())
      .catch(() => { /* already stopped */ })
      .finally(() => mount.remove());
  };

  const read = reader(onDetect);

  await scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 280, height: 170 } },
    (text) => read.saw(String(text || '').trim()),
    () => read.nothing() // per-frame "not found" — expected, and our idle signal
  );

  return stop;
}

/**
 * Start scanning into `container`. `onDetect` fires once per item presented,
 * repeatedly, until the returned stop function is called.
 * @returns {Promise<() => void>} an idempotent stop function.
 * @throws {Error & {code?: 'denied'|'no_camera'|'no_formats'}}
 */
export async function startScanner(container, onDetect) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('no_camera'), { code: 'no_camera' });
  }

  if (hasNativeDetector()) {
    try {
      return await startNative(container, onDetect);
    } catch (e) {
      // A refused permission won't be fixed by trying the other backend.
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        throw Object.assign(e, { code: 'denied' });
      }
      container.replaceChildren();
    }
  }

  try {
    return await startFallback(container, onDetect);
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      throw Object.assign(e, { code: 'denied' });
    }
    throw e;
  }
}

/* Exported for tests — the confirm/hold logic is where scanning goes wrong. */
export const __test__ = { reader, CONFIRMATIONS, CLEAR_AFTER_IDLE, MIN_REPEAT_MS };
