import { describe, expect, it } from 'vitest';
import { __test__ } from '../src/lib/scanner';

const { reader, CONFIRMATIONS, CLEAR_AFTER_IDLE, MIN_REPEAT_MS } = __test__;

/** Drive the reader with a fake clock so repeat rules are testable. */
function harness() {
  const seen = [];
  let now = 0;
  const r = reader((v) => seen.push(v), () => now);
  return {
    seen,
    advance: (ms) => { now += ms; },
    frames: (value, n = 1) => { for (let i = 0; i < n; i++) r.saw(value); },
    blank: (n = 1) => { for (let i = 0; i < n; i++) r.nothing(); },
  };
}

describe('camera reader', () => {
  it('ignores a single frame — one read is not a scan', () => {
    const h = harness();
    h.frames('6285534145371', CONFIRMATIONS - 1);
    expect(h.seen).toEqual([]);
  });

  it('emits once the same code is confirmed', () => {
    const h = harness();
    h.frames('6285534145371', CONFIRMATIONS);
    expect(h.seen).toEqual(['6285534145371']);
  });

  it('does not re-add an item left sitting in front of the lens', () => {
    const h = harness();
    h.frames('6285534145371', 40);
    h.advance(10000);
    h.frames('6285534145371', 40);
    expect(h.seen).toEqual(['6285534145371']);
  });

  it('accepts the same product again once it leaves and comes back', () => {
    const h = harness();
    h.frames('6285534145371', CONFIRMATIONS);
    h.blank(CLEAR_AFTER_IDLE);
    h.advance(MIN_REPEAT_MS + 1);
    h.frames('6285534145371', CONFIRMATIONS);
    expect(h.seen).toEqual(['6285534145371', '6285534145371']);
  });

  it('does not double-add on a brief dropout', () => {
    const h = harness();
    h.frames('6285534145371', CONFIRMATIONS);
    h.blank(CLEAR_AFTER_IDLE - 1); // a flicker, not a removal
    h.frames('6285534145371', 10);
    expect(h.seen).toEqual(['6285534145371']);
  });

  it('scans a different product straight away', () => {
    const h = harness();
    h.frames('1111111111111', CONFIRMATIONS);
    h.frames('2222222222222', CONFIRMATIONS);
    h.frames('3333333333333', CONFIRMATIONS);
    expect(h.seen).toEqual(['1111111111111', '2222222222222', '3333333333333']);
  });

  it('rejects a code that never settles', () => {
    const h = harness();
    for (let i = 0; i < 20; i++) {
      h.frames('1111111111111');
      h.frames('2222222222222');
    }
    expect(h.seen).toEqual([]);
  });

  it('ignores empty reads', () => {
    const h = harness();
    h.frames('', 10);
    expect(h.seen).toEqual([]);
  });
});
