import { useEffect, useRef } from "react";
import { isArray } from "../utils";

/**
 * Attaches an event listener to `element` (or `window`, if not specified). The event
 * handler does not need to be memoized.
 *
 * `eventType` can be an array and does not need to be memoized, but its length _must not_
 * change over the lifetime of the component.
 */
export function useEventListener(
  eventType: string | readonly string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (e: any) => void,
  target: HTMLElement | EventTarget = window,
): void {
  const savedHandler = useRef<EventListener>(handler);

  useEffect(() => {
    savedHandler.current = handler;
  });

  const eventTypes = isArray(eventType) ? eventType : [eventType];

  useEffect(() => {
    if (
      !savedHandler.current ||
      !target ||
      !target.addEventListener ||
      eventTypes.length === 0
    ) {
      return;
    }

    const eventListener = (event: Event) => savedHandler.current?.(event);
    eventTypes.forEach((t) =>
      target.addEventListener(t, eventListener, { passive: false }),
    );

    return () => {
      eventTypes.forEach((t) =>
        target.removeEventListener(t, eventListener, false),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...eventTypes, target]);
}
