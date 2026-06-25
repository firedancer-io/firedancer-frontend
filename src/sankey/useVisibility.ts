import { useRef, useEffect } from "react";
import { useUnmount } from "react-use";

export function getLinkId(l: {
  source: { id: string };
  target: { id: string };
  index: number;
}) {
  return `${l.source.id}.${l.target.id}.${l.index}`;
}

// Tracks visibility and delays hiding item for 3s after value drops to zero.
// Uses refs to avoid extra render cycles by imperatively calling draw when
// a visibility timeout fires.
export function useVisibility(
  items: { id: string; value: number }[],
  draw: React.RefObject<(() => void) | null>,
): React.MutableRefObject<Set<string>> {
  const visibilityRef = useRef<Set<string>>(
    new Set(items.filter(({ value }) => value).map(({ id }) => id)),
  );
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useUnmount(() => {
    for (const t of timeoutsRef.current.values()) clearTimeout(t);
  });

  useEffect(() => {
    for (const { id, value } of items) {
      if (value) {
        const pending = timeoutsRef.current.get(id);
        if (pending !== undefined) {
          clearTimeout(pending);
          timeoutsRef.current.delete(id);
        }
        visibilityRef.current.add(id);
      } else if (
        visibilityRef.current.has(id) &&
        !timeoutsRef.current.has(id)
      ) {
        timeoutsRef.current.set(
          id,
          setTimeout(() => {
            timeoutsRef.current.delete(id);
            visibilityRef.current.delete(id);
            draw.current?.();
          }, 3_000),
        );
      }
    }
  }, [items, draw]);

  return visibilityRef;
}
