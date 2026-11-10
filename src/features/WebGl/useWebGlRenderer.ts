import { useLayoutEffect, useRef } from "react";
import type * as THREE from "three";
import {
  useWebGlEventHandlers,
  type ContextHelpers,
} from "./useWebGlEventHandlers";
import { MAX_WEBGL_PX_RATIO } from "../../consts";

interface RendererObjBase {
  renderer: THREE.WebGLRenderer;
  cleanUp: () => void;
}

interface UseWebGlRendererOptions<T extends RendererObjBase> {
  remount: () => void;
  create: (contextHelpers: ContextHelpers) => T | undefined;
  onResize: (rendererObj: T) => void;
}

function devicePixelSize(entry: ResizeObserverEntry): [number, number] {
  const size = entry.devicePixelContentBoxSize?.[0];
  if (size) return [size.inlineSize, size.blockSize];
  // Safari has no device-pixel-content-box, so estimate it
  const { inlineSize, blockSize } = entry.contentBoxSize[0];
  return [
    Math.round(inlineSize * window.devicePixelRatio),
    Math.round(blockSize * window.devicePixelRatio),
  ];
}

function syncRendererSize(renderer: THREE.WebGLRenderer, onResize: () => void) {
  const canvas = renderer.domElement;
  const observer = new ResizeObserver(([entry]) => {
    const [widthPx, heightPx] = devicePixelSize(entry);
    // DPR changes when the window moves between monitors
    const pixelRatio = Math.min(window.devicePixelRatio, MAX_WEBGL_PX_RATIO);
    renderer.setPixelRatio(pixelRatio);
    // < 1 when the pixel ratio is capped
    const scale = pixelRatio / window.devicePixelRatio;
    // setSize floors the canvas size but rounds the viewport
    renderer.setSize(
      (Math.round(widthPx * scale) + 0.25) / pixelRatio,
      (Math.round(heightPx * scale) + 0.25) / pixelRatio,
      false,
    );
    onResize();
  });
  try {
    observer.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(canvas);
  }
  return () => observer.disconnect();
}

export function useWebGlRenderer<T extends RendererObjBase>({
  remount,
  create,
  onResize,
}: UseWebGlRendererOptions<T>) {
  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<T>();

  const createRef = useRef(create);
  const onResizeRef = useRef(onResize);
  createRef.current = create;
  onResizeRef.current = onResize;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const obj = createRef.current({ setUpContextListeners, getWasContextLost });
    if (!obj) return;

    rendererRef.current = obj;
    const canvas = obj.renderer.domElement;
    // The container needs a definite size
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.replaceChildren(canvas);
    const stopSyncingSize = syncRendererSize(obj.renderer, () =>
      onResizeRef.current(obj),
    );

    return () => {
      stopSyncingSize();
      obj.cleanUp();
      rendererRef.current = undefined;
    };
  }, [setUpContextListeners, getWasContextLost]);

  return { containerRef, rendererRef, getWasContextLost };
}
