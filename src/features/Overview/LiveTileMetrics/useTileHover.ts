import { useEffect, useMemo, type MutableRefObject } from "react";
import tableStyles from "../../../components/dataTable.module.css";
import { getPinnedRowId, getRowIds, getUnpinnedRowId } from "./utils";

export interface HoverRowProps {
  id: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function setRowHover(idx: number, hover: boolean) {
  for (const id of getRowIds(idx)) {
    document.getElementById(id)?.classList.toggle(tableStyles.hovered, hover);
  }
}

function setHoveredIdx(
  hoveredIdxRef: MutableRefObject<number | undefined>,
  idx: number,
  isHovered: boolean,
) {
  setRowHover(idx, isHovered);

  if (isHovered) {
    hoveredIdxRef.current = idx;
    return;
  }

  if (hoveredIdxRef.current === idx) {
    // clear hover idx if it's still this idx
    hoveredIdxRef.current = undefined;
  }
}

export function useTileHover(
  isPinned: boolean,
  idx: number,
  hoveredIdxRef: MutableRefObject<number | undefined>,
): HoverRowProps {
  // re-sync hover state on mount / idx change
  useEffect(() => {
    const isHovered = hoveredIdxRef.current === idx;
    setHoveredIdx(hoveredIdxRef, idx, isHovered);
  }, [idx, isPinned, hoveredIdxRef]);

  return useMemo(
    () => ({
      id: isPinned ? getPinnedRowId(idx) : getUnpinnedRowId(idx),
      onMouseEnter: () => setHoveredIdx(hoveredIdxRef, idx, true),
      onMouseLeave: () => setHoveredIdx(hoveredIdxRef, idx, false),
    }),
    [hoveredIdxRef, idx, isPinned],
  );
}
