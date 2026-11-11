import * as THREE from "three";
import { getDefaultStore } from "jotai";
import { useEffect, type RefObject } from "react";
import { useClickAway, useKey, useLatest } from "react-use";
import {
  clearSelectedSlotAtom,
  delayHoveredSlotClear,
  dismissPinnedAtom,
  hoveredRangeAtom,
  hoveredSlotAtom,
  isReplayTooltipPinnedAtom,
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
  type RectMesh,
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

vec3 applyHighlight(
  vec3 color,
  bool inFocusSlot,
  bool inFocusGroup,
  bool inHoveredOtherSlot,
  bool inHoveredOtherGroup
) {
  // structured if: an early return or ternary here crashes Adreno D3D11 when inlined twice
  if (uHighlightActive > 0.5) {
    float level = uLevels.y;
    if (inFocusGroup) level = uLevels.x;
    if (inFocusSlot) level = 1.0;
    if (inHoveredOtherSlot) level = max(level, HOVERED_OTHER_LEVEL);
    color = mix(HIGHLIGHT_BACKGROUND, color, level);

    if (inFocusGroup) color = overlayWhite(color, uLifts.x);
    if (inFocusSlot) color = overlayWhite(color, uLifts.y);
    if (inHoveredOtherGroup) color = overlayWhite(color, HOVERED_OTHER_LIFTS.x);
    if (inHoveredOtherSlot) color = overlayWhite(color, HOVERED_OTHER_LIFTS.y);
  }
  return color;
}

bool isSameSlot(float slot, float other) {
  return abs(slot - other) < 0.5;
}

bool isSameGroup(float slot, float other) {
  return floor(slot / SLOTS_PER_LEADER) == floor(other / SLOTS_PER_LEADER);
}

vec3 highlightSlot(vec3 color, float slot) {
  bool hasSlot = slot > NO_SLOT;
  return applyHighlight(
    color,
    hasSlot && isSameSlot(slot, uFocusSlot),
    hasSlot && isSameGroup(slot, uFocusSlot),
    hasSlot && isSameSlot(slot, uHoveredOtherSlot),
    hasSlot && isSameGroup(slot, uHoveredOtherSlot)
  );
}

bool isInPx(vec2 rangePx, float px) {
  return rangePx.x <= px && px < rangePx.y;
}

vec3 highlightTime(vec3 color, float px) {
  return applyHighlight(
    color,
    isInPx(uFocusRangePx.xy, px),
    isInPx(uFocusRangePx.zw, px),
    isInPx(uHoveredOtherRangePx.xy, px),
    isInPx(uHoveredOtherRangePx.zw, px)
  );
}
`;

// dims/lifts by the mesh's own relative slot (uSlot)
export const slotFragmentShader = /* glsl */ `
precision highp float;
uniform float uOpacity;
uniform float uSlot;
varying vec3 vColor;
${slotHighlightGlsl}
void main() {
  gl_FragColor = vec4(highlightSlot(vColor, uSlot), uOpacity);
}
`;

export function getSlotUniforms(highlight: SlotHighlight) {
  return { ...highlight.uniforms, uSlot: { value: NO_SLOT } };
}

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

export function setMeshSlot(
  highlight: SlotHighlight,
  slotMesh: RectMesh,
  slot: number,
) {
  const material = slotMesh.mesh.material as THREE.RawShaderMaterial;
  material.uniforms.uSlot.value = getRelativeSlot(highlight, slot);
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

// omit for slot-only highlights, which don't draw range marks
interface HighlightRanges {
  visibleRange: TsRange;
  focusRange: SlotRange | undefined;
  hoveredOtherRange: SlotRange | undefined;
}

function applySlotHighlight(
  highlight: SlotHighlight,
  viewWidthPx: number,
  focus: SlotFocus | undefined,
  ranges?: HighlightRanges,
) {
  const { uniforms } = highlight;
  if (!focus) {
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

  if (!ranges) {
    uniforms.uFocusRangePx.value.set(0, 0, 0, 0);
    uniforms.uHoveredOtherRangePx.value.set(0, 0, 0, 0);
    return;
  }

  setRangePx(
    uniforms.uFocusRangePx.value,
    ranges.focusRange,
    ranges.visibleRange,
    viewWidthPx,
  );
  setRangePx(
    uniforms.uHoveredOtherRangePx.value,
    focus.hoveredOtherSlot === undefined ? undefined : ranges.hoveredOtherRange,
    ranges.visibleRange,
    viewWidthPx,
  );
}

// slot-only hover highlight, for charts outside Replay
export function updateSlotHighlightForSlots(
  highlight: SlotHighlight,
  hoveredSlot: number | undefined,
) {
  applySlotHighlight(highlight, 0, getSlotFocus(hoveredSlot, undefined));
}

// call before each render
export function updateSlotHighlight(
  highlight: SlotHighlight,
  viewWidthPx: number,
) {
  const hoveredSlot = store.get(hoveredSlotAtom);
  const selectedSlot = store.get(selectedSlotAtom);
  const focus = getSlotFocus(hoveredSlot, selectedSlot);
  const visibleRange = store.get(visibleRangeAtom);
  if (!focus || !visibleRange) {
    highlight.uniforms.uHighlightActive.value = 0;
    return;
  }

  const isSelected = selectedSlot !== undefined;
  applySlotHighlight(highlight, viewWidthPx, focus, {
    visibleRange,
    focusRange: store.get(isSelected ? selectedRangeAtom : hoveredRangeAtom),
    hoveredOtherRange: store.get(hoveredRangeAtom),
  });
}

export function useSlotHighlightRender(render: () => void) {
  useEffect(() => {
    const unsubs = [
      store.sub(hoveredSlotAtom, render),
      store.sub(selectedSlotAtom, render),
      store.sub(hoveredRangeAtom, render),
      store.sub(selectedRangeAtom, render),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [render]);
}

export function useHoveredSlotClearDelay() {
  useEffect(() => delayHoveredSlotClear(store), []);
}

// On Escape close the pinned overlap tooltip if it's open, otherwise clear the
// selected slot. Leaves Escape to open menus and dialogs, which close on it.
// Also clears on a press outside Replay, except in popups like the overlap tooltip.
export function useDismissSelection(replayRef: RefObject<HTMLElement>) {
  useKey("Escape", (e) => {
    const isInLayer =
      e.target instanceof Element &&
      e.target.closest('[role="listbox"], [role="menu"], [role="dialog"]');
    if (isInLayer) return;
    if (store.get(isReplayTooltipPinnedAtom)) {
      store.set(dismissPinnedAtom);
      return;
    }
    store.set(clearSelectedSlotAtom);
  });
  useClickAway(replayRef, (e) => {
    const isInPopup =
      e.target instanceof Element &&
      e.target.closest(
        '[data-radix-popper-content-wrapper], [role="listbox"], [data-replay-popup]',
      );
    if (!isInPopup) store.set(clearSelectedSlotAtom);
  });
}

type SlotHitTest = (clientX: number, clientY: number) => number | undefined;
const slotHitTests = new Set<SlotHitTest>();

// tracks whose marks overlap in time report the slot drawn at a point
export function useSlotHitTest(hitTest: SlotHitTest) {
  const hitTestRef = useLatest(hitTest);
  useEffect(() => {
    const test: SlotHitTest = (clientX, clientY) =>
      hitTestRef.current(clientX, clientY);
    slotHitTests.add(test);
    return () => {
      slotHitTests.delete(test);
    };
  }, [hitTestRef]);
}

export type ContainerSlotHitTest = (
  clientX: number,
  clientY: number,
  rect: DOMRect,
) => number | undefined;

// register a hit-test scoped to a container, only called while the cursor is inside it
export function useContainerSlotHitTest(
  containerRef: RefObject<HTMLElement | null>,
  resolve: ContainerSlotHitTest,
) {
  const resolveRef = useLatest(resolve);
  useSlotHitTest((clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const isInside =
      rect.left <= clientX &&
      clientX <= rect.right &&
      rect.top <= clientY &&
      clientY <= rect.bottom;
    if (!isInside) return;

    return resolveRef.current(clientX, clientY, rect);
  });
}

export function getDrawnSlotAt(clientX: number, clientY: number) {
  for (const hitTest of slotHitTests) {
    const slot = hitTest(clientX, clientY);
    if (slot !== undefined) return slot;
  }
}
