import { getDefaultStore } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import { useUnmount } from "react-use";
import { useThrottledCallback, useDebouncedCallback } from "use-debounce";
import { isDocumentVisibleAtom } from "../atoms";

const store = getDefaultStore();

/**
 * Only use the throttled callback while visible.
 * Otherwise, clear the timers and use requestAnimationFrame to call
 * the callback on the next frame (rAF is paused while backgrounded, so no timers
 * accumulate).
 */
export function useThrottledCallbackIfVisible<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (...args: any) => ReturnType<T>,
>(...args: Parameters<typeof useThrottledCallback<T>>) {
  const throttledFn = useThrottledCallback(...args);
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
    [throttledFn],
  );

  const cancel = useCallback(() => {
    throttledFn.cancel();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, [throttledFn]);

  return useMemo(() => Object.assign(fn, { cancel }), [fn, cancel]);
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
