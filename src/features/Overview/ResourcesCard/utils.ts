import type { Tile } from "../../../api/types";
import { resourcesAvailableColor, resourcesOtherColor } from "../../../colors";

export interface ResourceSegment {
  key: string;
  label: string;
  bytes: number;
  color: string;
}

export const plural = (n: number) => (n === 1 ? "" : "s");

export function getTileLabel(tiles: Tile[] | undefined, tileIdx: number) {
  const tile = tiles?.[tileIdx];
  return `${tile?.kind}:${tile?.kind_id}`;
}

export function getUsageSegments(
  firedancerSegments: ResourceSegment[],
  otherBytes: number,
  freeBytes: number,
): ResourceSegment[] {
  return [
    ...firedancerSegments,
    {
      key: "other",
      label: "Other",
      bytes: otherBytes,
      color: resourcesOtherColor,
    },
    {
      key: "free",
      label: "Free",
      bytes: freeBytes,
      color: resourcesAvailableColor,
    },
  ].filter((segment) => segment.bytes > 0);
}
