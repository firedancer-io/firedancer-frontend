import { atom } from "jotai";
import { atomWithImmer } from "jotai-immer";

export const [
  setScrollFuncsAtom,
  deleteScrollFuncsAtom,
  scrollAllFuncsAtom,
  resetScrollFuncsAtom,
] = (function () {
  const scrollFuncsAtom = atomWithImmer<
    Record<number, (scrollLeft: number) => void>
  >({});
  const scrollLeftAtom = atom(0);

  return [
    atom(
      null,
      (get, set, slot: number, scrollFunc: (scrollLeft: number) => void) => {
        const scrollInit = get(scrollLeftAtom);
        if (scrollInit) {
          scrollFunc(scrollInit);
        }

        set(scrollFuncsAtom, (draft) => {
          draft[slot] = scrollFunc;
        });
      }
    ),
    atom(null, (get, set, slot: number) => {
      set(scrollFuncsAtom, (draft) => {
        delete draft[slot];
      });
    }),
    atom(null, (get, set, slot: number, scrollLeft: number) => {
      for (const [scrollSlot, scroll] of Object.entries(get(scrollFuncsAtom))) {
        if (Number(scrollSlot) === slot) continue;
        scroll(scrollLeft);
      }

      set(scrollLeftAtom, scrollLeft);
    }),
    atom(null, (get, set) => {
      set(scrollFuncsAtom, {});
      set(scrollLeftAtom, 0);
    }),
  ];
})();
