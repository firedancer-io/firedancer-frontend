import { useSyncExternalStore } from "react";
import type * as OverlayStackModule from "./overlayStack";

export type OverlayStack = typeof OverlayStackModule;

let stack: OverlayStack | null = null;
let loading: Promise<OverlayStack> | null = null;
const subscribers = new Set<() => void>();

export function loadOverlayStack(): Promise<OverlayStack> {
  loading ??= import("./overlayStack").then((m) => {
    stack = m;
    for (const notify of subscribers) notify();
    return m;
  });
  return loading;
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/**
 * The overlay widgets once their chunk is in (preload-and-reveal, no
 * Suspense): consumers render their trigger bare until then. Every
 * overlay opens from a pointer or key gesture, and any such gesture is
 * preceded by one of the load triggers below, so the swap normally
 * lands before an open can be requested.
 */
export function useOverlayStack(): OverlayStack | null {
  return useSyncExternalStore(subscribe, () => stack);
}

const gestures = [
  "pointermove",
  "pointerdown",
  "keydown",
  "touchstart",
] as const;

function onFirstGesture() {
  for (const g of gestures) window.removeEventListener(g, onFirstGesture, true);
  void loadOverlayStack();
}

if (typeof window !== "undefined")
  for (const g of gestures)
    window.addEventListener(g, onFirstGesture, {
      capture: true,
      passive: true,
    });
