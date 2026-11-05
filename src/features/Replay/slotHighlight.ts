import * as THREE from "three";
import { getDefaultStore } from "jotai";
import { useEffect } from "react";
import {
  hoveredRangeAtom,
  hoveredSlotAtom,
  selectedRangeAtom,
  selectedSlotAtom,
  visibleRangeAtom,
  type SlotRange,
} from "./atoms";
import { getSlotGroupLeader } from "../../utils";
import { slotsPerLeader } from "../../consts";
import { replayTrackBackgroundColor } from "../../colors";
import {
  convertToWebGlColor,
  glslFloat,
  type TsRange,
} from "../WebGl/webglUtils";

const store = getDefaultStore();

const slotLevels = {
  hover: { group: 0.85, other: 0.65 },
  selected: { group: 0.75, other: 0.5 },
};

const hoveredOtherLevel = 0.85;

const slotLifts = {
  hover: { group: 0.1, slot: 0.2 },
  selected: { group: 0.14, slot: 0.28 },
  selectedHovered: { group: 0.18, slot: 0.4 },
};

interface SlotFocus {
  focusSlot: number;
  hoveredOtherSlot: number | undefined;
  levels: { group: number; other: number };
  lifts: { group: number; slot: number };
}

export function getSlotFocus(
  hoveredSlot: number | undefined,
  selectedSlot: number | undefined,
): SlotFocus | undefined {
  if (selectedSlot === undefined) {
    if (hoveredSlot === undefined) return;
    return {
      focusSlot: hoveredSlot,
      hoveredOtherSlot: undefined,
      levels: slotLevels.hover,
      lifts: slotLifts.hover,
    };
  }
  const isHoveringSelected = hoveredSlot === selectedSlot;
  return {
    focusSlot: selectedSlot,
    hoveredOtherSlot: isHoveringSelected ? undefined : hoveredSlot,
    levels: slotLevels.selected,
    lifts: isHoveringSelected ? slotLifts.selectedHovered : slotLifts.selected,
  };
}

const isSameGroup = (slot: number, other: number | undefined) =>
  other !== undefined && getSlotGroupLeader(slot) === getSlotGroupLeader(other);

// header cards dim per leader
export function getGroupLevel(
  leaderSlot: number,
  focus: SlotFocus | undefined,
) {
  if (
    !focus ||
    isSameGroup(leaderSlot, focus.focusSlot) ||
    isSameGroup(leaderSlot, focus.hoveredOtherSlot)
  ) {
    return 1;
  }
  return focus.levels.other;
}

// far from any real relative slot
export const NO_SLOT = -1e9;

const background = convertToWebGlColor(replayTrackBackgroundColor);

// sRGB colors; highlightTime is for marks without a slot
export const slotHighlightGlsl = /* glsl */ `
uniform float uHighlightActive;
uniform float uFocusSlot;
uniform float uHoveredOtherSlot;
uniform vec2 uLevels;
uniform vec2 uLifts;
uniform vec4 uFocusRangePx;
uniform vec4 uHoveredOtherRangePx;

const float SLOTS_PER_LEADER = ${glslFloat(slotsPerLeader)};
const float NO_SLOT = ${glslFloat(NO_SLOT)};
const vec3 HIGHLIGHT_BACKGROUND = vec3(${background.map(glslFloat).join(", ")});
const float HOVERED_OTHER_LEVEL = ${glslFloat(hoveredOtherLevel)};
const vec2 HOVERED_OTHER_LIFTS = vec2(${glslFloat(slotLifts.hover.group)}, ${glslFloat(slotLifts.hover.slot)});

vec3 overlayWhite(vec3 color, float alpha) {
  vec3 dark = color * (1.0 + alpha);
  vec3 light = color + alpha * (1.0 - color);
  return mix(dark, light, step(0.5, color));
}

/**
 * Fractions of a mark in the focus slot, the focus group, the hovered other
 * slot, and the hovered other group. Marks mixing slots, e.g. a px of
 * accumulated coverage, highlight by their fractions.
 */
vec3 applyHighlight(vec3 color, vec4 fractions) {
  // structured if: an early return or ternary here crashes Adreno D3D11 when inlined twice
  if (uHighlightActive > 0.5) {
    float inFocusSlot = fractions.x;
    float inFocusGroup = fractions.y;
    float inHoveredOtherSlot = fractions.z;
    float inHoveredOtherGroup = fractions.w;
    float level =
      uLevels.y +
      inFocusGroup * (uLevels.x - uLevels.y) +
      inFocusSlot * (1.0 - uLevels.x);
    level += inHoveredOtherSlot * max(HOVERED_OTHER_LEVEL - level, 0.0);
    color = mix(HIGHLIGHT_BACKGROUND, color, level);

    color = overlayWhite(color, uLifts.x * inFocusGroup);
    color = overlayWhite(color, uLifts.y * inFocusSlot);
    color = overlayWhite(color, HOVERED_OTHER_LIFTS.x * inHoveredOtherGroup);
    color = overlayWhite(color, HOVERED_OTHER_LIFTS.y * inHoveredOtherSlot);
  }
  return color;
}

bool isSameSlot(float slot, float other) {
  return abs(slot - other) < 0.5;
}

bool isSameGroup(float slot, float other) {
  return floor(slot / SLOTS_PER_LEADER) == floor(other / SLOTS_PER_LEADER);
}

/** applyHighlight fractions of a mark in a single relative slot */
vec4 getSlotFractions(float slot) {
  vec4 fractions = vec4(0.0);
  if (slot > NO_SLOT) {
    fractions = vec4(
      isSameSlot(slot, uFocusSlot),
      isSameGroup(slot, uFocusSlot),
      isSameSlot(slot, uHoveredOtherSlot),
      isSameGroup(slot, uHoveredOtherSlot)
    );
  }
  return fractions;
}

vec3 highlightSlot(vec3 color, float slot) {
  return applyHighlight(color, getSlotFractions(slot));
}

bool isInPx(vec2 rangePx, float px) {
  return rangePx.x <= px && px < rangePx.y;
}

vec3 highlightTime(vec3 color, float px) {
  return applyHighlight(
    color,
    vec4(
      isInPx(uFocusRangePx.xy, px),
      isInPx(uFocusRangePx.zw, px),
      isInPx(uHoveredOtherRangePx.xy, px),
      isInPx(uHoveredOtherRangePx.zw, px)
    )
  );
}
`;

export interface SlotHighlight {
  uniforms: {
    uHighlightActive: THREE.IUniform<number>;
    uFocusSlot: THREE.IUniform<number>;
    uHoveredOtherSlot: THREE.IUniform<number>;
    uLevels: THREE.IUniform<THREE.Vector2>;
    uLifts: THREE.IUniform<THREE.Vector2>;
    uFocusRangePx: THREE.IUniform<THREE.Vector4>;
    uHoveredOtherRangePx: THREE.IUniform<THREE.Vector4>;
  };
  referenceSlot: number | undefined;
}

export function createSlotHighlight(): SlotHighlight {
  return {
    uniforms: {
      uHighlightActive: { value: 0 },
      uFocusSlot: { value: NO_SLOT },
      uHoveredOtherSlot: { value: NO_SLOT },
      uLevels: { value: new THREE.Vector2(1, 1) },
      uLifts: { value: new THREE.Vector2() },
      uFocusRangePx: { value: new THREE.Vector4() },
      uHoveredOtherRangePx: { value: new THREE.Vector4() },
    },
    referenceSlot: undefined,
  };
}

// small relative slots stay exact in float32
export function getRelativeSlot(highlight: SlotHighlight, slot: number) {
  highlight.referenceSlot ??= getSlotGroupLeader(slot);
  return slot - highlight.referenceSlot;
}

function setRangePx(
  target: THREE.Vector4,
  range: SlotRange | undefined,
  visibleRange: TsRange,
  viewWidthPx: number,
) {
  if (!range) {
    target.set(0, 0, 0, 0);
    return;
  }
  const [visibleStart, visibleEnd] = visibleRange;
  const toPx = (ms: number) =>
    ((ms - visibleStart) / (visibleEnd - visibleStart)) * viewWidthPx;
  target.set(
    toPx(range.slot[0]),
    toPx(range.slot[1]),
    toPx(range.group[0]),
    toPx(range.group[1]),
  );
}

// call before each render
export function updateSlotHighlight(
  highlight: SlotHighlight,
  viewWidthPx: number,
) {
  const { uniforms } = highlight;
  const hoveredSlot = store.get(hoveredSlotAtom);
  const selectedSlot = store.get(selectedSlotAtom);
  const focus = getSlotFocus(hoveredSlot, selectedSlot);
  const visibleRange = store.get(visibleRangeAtom);
  if (!focus || !visibleRange) {
    uniforms.uHighlightActive.value = 0;
    return;
  }

  uniforms.uHighlightActive.value = 1;
  uniforms.uFocusSlot.value = getRelativeSlot(highlight, focus.focusSlot);
  uniforms.uHoveredOtherSlot.value =
    focus.hoveredOtherSlot === undefined
      ? NO_SLOT
      : getRelativeSlot(highlight, focus.hoveredOtherSlot);
  uniforms.uLevels.value.set(focus.levels.group, focus.levels.other);
  uniforms.uLifts.value.set(focus.lifts.group, focus.lifts.slot);

  const isSelected = selectedSlot !== undefined;
  setRangePx(
    uniforms.uFocusRangePx.value,
    store.get(isSelected ? selectedRangeAtom : hoveredRangeAtom),
    visibleRange,
    viewWidthPx,
  );
  setRangePx(
    uniforms.uHoveredOtherRangePx.value,
    focus.hoveredOtherSlot === undefined
      ? undefined
      : store.get(hoveredRangeAtom),
    visibleRange,
    viewWidthPx,
  );
}

export function useSlotHighlightRender(render: () => void) {
  useEffect(() => {
    const unsubs = [
      store.sub(hoveredSlotAtom, render),
      store.sub(selectedSlotAtom, render),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [render]);
}
