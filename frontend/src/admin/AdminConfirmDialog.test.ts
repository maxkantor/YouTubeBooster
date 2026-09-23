import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scrollPanelIfNeeded } from './AdminConfirmDialog';

describe('AdminConfirmDialog helpers', () => {
  it('does not scroll when the panel is already fully visible', () => {
    const calls: string[] = [];
    const el = {
      getBoundingClientRect: () => ({ top: 80, bottom: 240 }),
      scrollIntoView: () => {
        calls.push('scroll');
      }
    } as unknown as HTMLElement;
    const prev = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerHeight: 800 }
    });
    scrollPanelIfNeeded(el);
    assert.deepEqual(calls, []);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: prev });
  });
});
