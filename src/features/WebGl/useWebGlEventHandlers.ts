import { useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import type { WebGlRemountProps } from "./withWebGlRemount";
import { isWebgl2SupportedAtom } from "./atoms";

/**
 * How long to wait for the GPU to restore a lost WebGL context before falling back to the canvas chart.
 * Context loss is usually transient (tab backgrounded, GPU reset, driver hiccup) and the browser restores it within
 * 1 ~ 2 frames.
 */
const CONTEXT_RESTORE_TIMEOUT_MS = 10_000;

export function useWebGlEventHandlers({ remount }: WebGlRemountProps) {
  const setWebgl2Supported = useSetAtom(isWebgl2SupportedAtom);

  /**
   * whether the context was ever lost during this mount
   */
  const wasContextLostRef = useRef(false);
  const getWasContextLost = useCallback(() => wasContextLostRef.current, []);

  /**
   * timeout to mark lack of WebGL2 support when context is lost and not restored
   */
  const contextLostTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const resetContextLostTimer = useCallback(() => {
    clearTimeout(contextLostTimeoutRef.current);
    contextLostTimeoutRef.current = undefined;
  }, []);

  const getHandleContextLost = useCallback(
    (canvasEl: HTMLCanvasElement) => (event: Event) => {
      // preventDefault so that the browser fires webglcontextrestored
      event.preventDefault();
      if (contextLostTimeoutRef.current) return;

      wasContextLostRef.current = true;
      contextLostTimeoutRef.current = setTimeout(() => {
        // trigger WebGL component unmount with the context still marked as lost
        setWebgl2Supported(false);
      }, CONTEXT_RESTORE_TIMEOUT_MS);

      // hide to avoid resizing issues while drawing is paused
      canvasEl.style.visibility = "hidden";
    },
    [setWebgl2Supported],
  );

  const handleContextRestored = useCallback(() => {
    resetContextLostTimer();
    remount();
  }, [remount, resetContextLostTimer]);

  const setUpContextListeners = useCallback(
    (canvasEl: HTMLCanvasElement) => {
      resetContextLostTimer();
      const handleContextLost = getHandleContextLost(canvasEl);
      canvasEl.addEventListener("webglcontextlost", handleContextLost);
      canvasEl.addEventListener("webglcontextrestored", handleContextRestored);

      // cleanup
      return () => {
        canvasEl.removeEventListener("webglcontextlost", handleContextLost);
        canvasEl.removeEventListener(
          "webglcontextrestored",
          handleContextRestored,
        );
        canvasEl.remove();
        resetContextLostTimer();
      };
    },
    [resetContextLostTimer, getHandleContextLost, handleContextRestored],
  );

  return {
    setUpContextListeners,
    getWasContextLost,
  };
}

export type ContextHelpers = ReturnType<typeof useWebGlEventHandlers>;
