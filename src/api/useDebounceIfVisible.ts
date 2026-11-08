import { getDefaultStore } from "jotai";
import { throttle, type ThrottleSettings } from "lodash";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useUnmount } from "react-use";
import { useDebouncedCallback } from "use-debounce";
import { isDocumentVisibleAtom } from "../atoms";

const store = getDefaultStore();

interface ThrottledIfVisible<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

/**
 * Only use the throttled callback while visible.
 * Otherwise, clear the timers and use requestAnimationFrame to call
 * the callback on the next frame (rAF is paused while backgrounded, so no timers
 * accumulate).
 */
export function throttleIfVisible<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number,
  options?: ThrottleSettings,
): ThrottledIfVisible<T> {
  const throttledFn = throttle(func, wait, options);
  let rafId: number | null = null;

  const fn = (...args: Parameters<T>) => {
    if (store.get(isDocumentVisibleAtom)) {
      throttledFn(...args);
      return;
    }

    // hidden, don't accumulate timers from throttledFn
    throttledFn.cancel();
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      func(...args);
    });
  };

  fn.cancel = () => {
    throttledFn.cancel();
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  };

  return fn;
}

/**
 * Only use the throttled callback while visible.
 * Otherwise, clear the timers and use requestAnimationFrame to call
 * the callback on the next frame (rAF is paused while backgrounded, so no timers
 * accumulate).
 */
export function useThrottledCallbackIfVisible<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (...args: any) => ReturnType<T>,
>(func: T, wait: number, options?: ThrottleSettings) {
  const funcRef = useRef(func);
  funcRef.current = func;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const throttled = useMemo(
    () =>
      throttleIfVisible(
        ((...args: Parameters<T>) => funcRef.current(...args)) as T,
        wait,
        optionsRef.current,
      ),
    [wait],
  );

  // cancel on unmount or change
  useEffect(() => () => throttled.cancel(), [throttled]);

  return throttled;
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
>(...args: Parameters<typeof useDebouncedCallback<T>>) {
  const debouncedFn = useDebouncedCallback(...args);
  const rafRef = useRef<number | null>(null);

  const argFunc = args[0];
  const funcRef = useRef(argFunc);
  funcRef.current = argFunc;

  useUnmount(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  });

  const fn = useCallback(
    (...args: Parameters<T>) => {
      if (store.get(isDocumentVisibleAtom)) {
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
    [debouncedFn],
  );

  const cancel = useCallback(() => {
    debouncedFn.cancel();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, [debouncedFn]);

  return useMemo(() => Object.assign(fn, { cancel }), [fn, cancel]);
}
