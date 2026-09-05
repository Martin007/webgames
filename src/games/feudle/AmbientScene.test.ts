import {describe, expect, it} from 'vitest';
import {
  AMBIENT_DURATION_IN_FRAMES,
  getEdgeFade,
  getLoopPhase,
} from './AmbientScene';

describe('ambient animation loop', () => {
  it('returns to almost the same position at the loop boundary', () => {
    const start = getLoopPhase(0, AMBIENT_DURATION_IN_FRAMES);
    const end = getLoopPhase(
      AMBIENT_DURATION_IN_FRAMES - 1,
      AMBIENT_DURATION_IN_FRAMES,
    );

    expect(Math.abs(Math.sin(start) - Math.sin(end))).toBeLessThan(0.004);
    expect(Math.abs(Math.cos(start) - Math.cos(end))).toBeLessThan(0.001);
  });

  it('softly hides celebratory elements at both loop edges', () => {
    expect(getEdgeFade(0, AMBIENT_DURATION_IN_FRAMES, 30, 0)).toBe(0);
    expect(
      getEdgeFade(
        AMBIENT_DURATION_IN_FRAMES - 1,
        AMBIENT_DURATION_IN_FRAMES,
        30,
        0,
      ),
    ).toBe(0);
    expect(getEdgeFade(300, AMBIENT_DURATION_IN_FRAMES, 30, 0)).toBe(1);
  });
});
