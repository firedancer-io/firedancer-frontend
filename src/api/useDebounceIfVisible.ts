import { useCallback, useRef } from "react";
import { useUnmount } from "react-use";
import { useThrottledCallback, useDebouncedCallback } from "use-debounce";
import type { Options } from "use-debounce";

/**
 * Only use the throttled callback while visible.
 * Otherwise, clear the timers and use requestAnimationFrame to call
 * the callback on the next frame (rAF is paused while backgrounded, so no timers
 * accumulate).
 */
export function useThrottledCallbackIfVisible<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (...args: any) => ReturnType<T>,
>(isVisibleRef: React.RefObject<boolean>, func: T, wait: number) {
  const throttledFn = useThrottledCallback(func, wait);
  const rafRef = useRef<number | null>(null);

  const funcRef = useRef(func);
  funcRef.current = func;

  useUnmount(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  });

  return useCallback(
    (...args: Parameters<T>) => {
      if (isVisibleRef.current) {
        throttledFn(...args);
        return;
      }

      // hidden, don't accumulate timers from throttledFn
      throttledFn.cancel();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        return funcRef.current(...args);
      });
    },
    [isVisibleRef, throttledFn],
  );
}

/**
 * Only use the debounced callback while visible.
 * Otherwise, clear the timers and use requestAnimationFrame to call
 * the callback on the next frame (rAF is paused while backgrounded, so no timers
 * accumulate).
 */
export function useDebouncedCallbackIfVisible<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (...args: any) => ReturnType<T>,
>(
  isVisibleRef: React.RefObject<boolean>,
  func: T,
  wait: number,
  options?: Options,
) {
  const debouncedFn = useDebouncedCallback(func, wait, options);
  const rafRef = useRef<number | null>(null);

  const funcRef = useRef(func);
  funcRef.current = func;

  useUnmount(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  });

  return useCallback(
    (...args: Parameters<T>) => {
      if (isVisibleRef.current) {
        debouncedFn(...args);
        return;
      }

      // hidden, don't accumulate timers from debouncedFn
      debouncedFn.cancel();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        return funcRef.current(...args);
      });
    },
    [isVisibleRef, debouncedFn],
  );
}
