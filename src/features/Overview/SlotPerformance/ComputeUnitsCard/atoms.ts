import { atom } from "jotai";
import { ZoomRange } from "./types";

type TriggerZoom = (action: "in" | "out" | "reset") => void;

export const triggerZoomAtom = (function () {
  const triggerZoom = atom<TriggerZoom>();

  return atom(
    (get) => get(triggerZoom) ?? (() => 0),
    (get, set, _triggerZoom: TriggerZoom) => {
      set(triggerZoom, () => _triggerZoom);
    },
  );
})();

export const fitYToDataAtom = atom(false);

export const zoomRangeAtom = atom<ZoomRange>();

export const isMaxZoomRangeAtom = atom(false);

export const dragRangeAtom = atom<[number, number]>();
export const isDraggingAtom = atom((get) => get(dragRangeAtom) !== undefined);
export const isActiveDraggingAtom = atom((get) => {
  const dragRange = get(dragRangeAtom);
  return dragRange !== undefined && dragRange[0] !== dragRange[1];
});
