import { vi } from "vitest";

/**
 * Mock performance.timeOrigin + performance.now() by pinning to the mocked Date clock.
 * Call after vi.useFakeTimers()/vi.setSystemTime() and clean up with vi.unstubAllGlobals().
 */
export function stubPerformanceToFakeClock() {
  vi.stubGlobal("performance", {
    ...performance,
    now: () => 0,
    get timeOrigin() {
      return Date.now();
    },
  });
}
