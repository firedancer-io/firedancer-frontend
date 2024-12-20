import { atom } from "jotai";

export function rafAtom<T>(initialValue: T) {
  const baseAtom = atom(initialValue);
  let rafId: number | undefined = undefined;

  return atom(
    (get) => get(baseAtom),
    (_, set, value: T) => {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        rafId = undefined;
        set(baseAtom, value);
      });
    }
  );
}
