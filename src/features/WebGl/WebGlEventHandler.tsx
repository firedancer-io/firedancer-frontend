import { useSetAtom } from "jotai";
import { useState, useCallback, useRef, Fragment } from "react";
import { isWebgl2SupportedAtom } from "../Overview/ShredsProgression/atoms";
import { useUnmount } from "react-use";

/**
 * How long to wait for the GPU to restore a lost WebGL context before falling back to the canvas chart.
 * Context loss is usually transient (tab backgrounded, GPU reset, driver hiccup) and the browser restores it within
 * 1 ~ 2 frames.
 */
const CONTEXT_RESTORE_TIMEOUT_MS = 10_000;

export interface WebGlEventHandlerChildProps {
  setUpCanvasListeners: (canvas: HTMLCanvasElement) => void;
  resetContextStateAndListeners: () => void;
  getIsContextLost: () => boolean;
}

type WebGlEventHandlerProps = {
  children: (args: WebGlEventHandlerChildProps) => React.ReactNode;
};

export default function WebGlEventHandler({
  children,
}: WebGlEventHandlerProps) {
  const [key, setKey] = useState(0);
  const triggerRemount = useCallback(() => {
    setKey((prev) => prev + 1);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>();
  const setWebgl2Supported = useSetAtom(isWebgl2SupportedAtom);

  /**
   * timeout to mark lack of WebGL2 support when context is lost and not restored
   */
  const contextLostTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const resetContextLostState = useCallback(() => {
    clearTimeout(contextLostTimeoutRef.current);
    contextLostTimeoutRef.current = undefined;
  }, []);

  const handleContextLost = useCallback(
    (event: Event) => {
      // preventDefault so that the browser fires webglcontextrestored
      event.preventDefault();
      if (contextLostTimeoutRef.current) return;

      contextLostTimeoutRef.current = setTimeout(() => {
        // trigger WebGL component unmount with the context still marked as lost
        setWebgl2Supported(false);
      }, CONTEXT_RESTORE_TIMEOUT_MS);
    },
    [setWebgl2Supported],
  );

  const handleContextRestored = useCallback(() => {
    resetContextLostState();
    triggerRemount();
  }, [resetContextLostState, triggerRemount]);

  const resetContextStateAndListeners = useCallback(() => {
    resetContextLostState();
    if (!canvasRef.current) return;

    canvasRef.current.removeEventListener(
      "webglcontextlost",
      handleContextLost,
    );
    canvasRef.current.removeEventListener(
      "webglcontextrestored",
      handleContextRestored,
    );
    canvasRef.current.remove();
  }, [resetContextLostState, handleContextLost, handleContextRestored]);

  const setUpCanvasListeners = useCallback(
    (canvasEl: HTMLCanvasElement) => {
      resetContextStateAndListeners();

      canvasRef.current = canvasEl;
      canvasEl.addEventListener("webglcontextlost", handleContextLost);
      canvasEl.addEventListener("webglcontextrestored", handleContextRestored);
    },
    [resetContextStateAndListeners, handleContextLost, handleContextRestored],
  );

  const getIsContextLost = useCallback(
    () => contextLostTimeoutRef.current != null,
    [],
  );

  useUnmount(() => {
    resetContextStateAndListeners();
  });

  return (
    <Fragment key={key}>
      {children({
        setUpCanvasListeners,
        resetContextStateAndListeners,
        getIsContextLost,
      })}
    </Fragment>
  );
}
