import { getDefaultStore } from "jotai";
import * as THREE from "three";
import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import {
  createWebglResources,
  createRectMesh,
  createOutlineMesh,
  disposeWebglResources,
  ensureCapacity,
  addRectangleToMesh,
  updateRectMeshCount,
  updateOutlineUniforms,
  convertToWebGlColor,
  type RectMesh,
  type WebglResources,
  type TsRange,
  type RgbColor,
  type RgbaColor,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import { isWebgl2SupportedAtom } from "../../WebGl/atoms.ts";
import {
  stateColors,
  TxnState,
} from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";
import type {
  TxnTimestampBucket,
  TxnTimestampColumns,
} from "./txnTimestamps.ts";
import {
  ROW_FILL,
  minY,
  maxY,
  OUTLINE_ERROR_RGB,
  OUTLINE_SUCCESS_RGB,
  SIGVERIFY_RGB,
} from "./consts.ts";

const store = getDefaultStore();

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  resources: WebglResources;
  rectMesh: RectMesh;
  outlineMesh: RectMesh;
  cameraReferenceMs: number;
  cleanUp: () => void;
}

export function setUpRenderer(
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, MAX_WEBGL_PX_RATIO),
    );
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setClearColor(0x000000, 0);

    const resources = createWebglResources();
    const rectMesh = createRectMesh(resources);
    const outlineMesh = createOutlineMesh(resources);

    const clearContextListeners = setUpContextListeners(renderer.domElement);

    const cleanUp = () => {
      if (!getWasContextLost()) {
        rectMesh.mesh.geometry.dispose();
        outlineMesh.mesh.geometry.dispose();
        disposeWebglResources(resources);
        renderer.dispose();
      }

      clearContextListeners();
      if (!renderer.getContext().isContextLost()) {
        renderer.forceContextLoss();
      }
    };

    return {
      renderer,
      camera,
      scene,
      resources,
      rectMesh,
      outlineMesh,
      cameraReferenceMs: 0,
      cleanUp,
    };
  } catch {
    store.set(isWebgl2SupportedAtom, false);
  }
}

export function render(rendererObj: RendererObj) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

export function moveCamera(rendererObj: RendererObj, visibleRangeMs: TsRange) {
  const { camera, rectMesh, outlineMesh } = rendererObj;

  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  if (rectMesh.referenceX != null) {
    rectMesh.mesh.position.x = rectMesh.referenceX - cameraReferenceMs;
  }
  if (outlineMesh.referenceX != null) {
    outlineMesh.mesh.position.x = outlineMesh.referenceX - cameraReferenceMs;
  }
}

export function drawExecrp(
  rendererObj: RendererObj,
  buckets: TxnTimestampBucket[],
  execrpCount: number,
  getRelativeMs: (absoluteNs: bigint) => number,
  outlineBorderPx = 1.5,
) {
  const {
    cameraReferenceMs,
    scene,
    resources,
    renderer,
    rectMesh,
    outlineMesh,
  } = rendererObj;

  rectMesh.referenceX = cameraReferenceMs;
  outlineMesh.referenceX = cameraReferenceMs;

  updateOutlineUniforms(resources, renderer, outlineBorderPx);

  let rectCount = 0;
  let outlineCount = 0;
  if (execrpCount > 0) {
    const rowH = 1 / execrpCount;
    const barH = rowH * ROW_FILL;
    const drawn = new Set<string>();

    for (const bucket of buckets) {
      const { txns } = bucket;
      for (let i = 0; i < txns.txn_exec_idx.length; i++) {
        const key = `${txns.slot[i]}:${txns.txn_idx[i]}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        [rectCount, outlineCount] = appendTxn(
          txns,
          i,
          execrpCount,
          rowH,
          barH,
          getRelativeMs,
          rectMesh,
          outlineMesh,
          rectCount,
          outlineCount,
        );
      }
    }
  }

  updateRectMeshCount(rectMesh, rectCount);
  rectMesh.mesh.position.x = rectMesh.referenceX - cameraReferenceMs;
  scene.add(rectMesh.mesh);

  updateRectMeshCount(outlineMesh, outlineCount);
  if (outlineCount === 0) {
    scene.remove(outlineMesh.mesh);
  } else {
    outlineMesh.mesh.position.x = outlineMesh.referenceX - cameraReferenceMs;
    scene.add(outlineMesh.mesh);
  }
}

function tileYPosition(execrp: number, rowH: number) {
  return 1 - (execrp + 1) * rowH;
}

function pushRect(
  mesh: RectMesh,
  idx: number,
  startMs: number,
  endMs: number,
  y0: number,
  h: number,
  color: RgbColor | RgbaColor,
): number {
  ensureCapacity(mesh, idx + 1);
  addRectangleToMesh(
    mesh,
    idx,
    startMs - (mesh.referenceX ?? 0),
    y0,
    endMs - startMs,
    h,
    color,
  );
  return idx + 1;
}

function appendTxn(
  txns: TxnTimestampColumns,
  i: number,
  execrpCount: number,
  rowH: number,
  barH: number,
  getRelativeMs: (absoluteNs: bigint) => number,
  rectMesh: RectMesh,
  outlineMesh: RectMesh,
  rectCount: number,
  outlineCount: number,
): [rectCount: number, outlineCount: number] {
  const outlineColor =
    txns.txn_error_code[i] !== 0 ? OUTLINE_ERROR_RGB : OUTLINE_SUCCESS_RGB;

  const sigExecrp = txns.txn_sigverify_exec_idx[i];
  const sigStart = txns.txn_sigverify_start_nanos[i];
  const sigEnd = txns.txn_sigverify_end_nanos[i];
  if (sigExecrp >= 0 && sigExecrp < execrpCount && sigEnd > sigStart) {
    const sigRowBottom = tileYPosition(sigExecrp, rowH);
    const sigStartMs = getRelativeMs(sigStart);
    const sigEndMs = getRelativeMs(sigEnd);
    rectCount = pushRect(
      rectMesh,
      rectCount,
      sigStartMs,
      sigEndMs,
      sigRowBottom,
      barH,
      withAlpha(SIGVERIFY_RGB, 0.5),
    );
    outlineCount = pushRect(
      outlineMesh,
      outlineCount,
      sigStartMs,
      sigEndMs,
      sigRowBottom,
      barH,
      outlineColor,
    );
  }

  const execrp = txns.txn_exec_idx[i];
  if (execrp < 0 || execrp >= execrpCount) return [rectCount, outlineCount];

  const rowBottom = tileYPosition(execrp, rowH);

  const boundaries = getStateBoundaries(txns, i);
  if (boundaries.length < 2) return [rectCount, outlineCount];

  for (let b = 0; b < boundaries.length - 1; b++) {
    const leftNs = boundaries[b];
    const rightNs = boundaries[b + 1];
    if (rightNs <= leftNs) continue;
    const state = getStateAt(txns, i, leftNs);
    rectCount = pushRect(
      rectMesh,
      rectCount,
      getRelativeMs(leftNs),
      getRelativeMs(rightNs),
      rowBottom,
      barH,
      resolveStateColor(stateColors[state]),
    );
  }

  outlineCount = pushRect(
    outlineMesh,
    outlineCount,
    getRelativeMs(boundaries[0]),
    getRelativeMs(boundaries[boundaries.length - 1]),
    rowBottom,
    barH,
    outlineColor,
  );

  return [rectCount, outlineCount];
}

/** A hit-tested transaction, identified by its (slot, txn_idx). */
export interface TxnHit {
  slot: number;
  txnIdx: number;
}

/**
 * Find the transaction under a click, given the click position as fractions of
 * the track (fracX/fracY in 0..1, top-left origin) and the current visible range.
 * A txn is hit when the click's time falls within its execution span (on its
 * execution row) or its sigverify span (on its sigverify row), with `tolMs` of
 * slack so thin bars are still clickable. Returns the first match, or undefined.
 */
export function hitTestTxn(
  buckets: TxnTimestampBucket[],
  execrpCount: number,
  getRelativeMs: (absoluteNs: bigint) => number,
  visibleRangeMs: TsRange,
  fracX: number,
  fracY: number,
  tolMs: number,
): TxnHit | undefined {
  if (execrpCount <= 0) return undefined;

  const relMs =
    visibleRangeMs[0] + fracX * (visibleRangeMs[1] - visibleRangeMs[0]);
  const row = Math.floor(fracY * execrpCount);
  if (row < 0 || row >= execrpCount) return undefined;

  const within = (startMs: number, endMs: number) =>
    relMs >= startMs - tolMs && relMs <= endMs + tolMs;

  const seen = new Set<string>();
  for (const { txns } of buckets) {
    for (let i = 0; i < txns.txn_exec_idx.length; i++) {
      const key = `${txns.slot[i]}:${txns.txn_idx[i]}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Execution span on the execution row.
      if (txns.txn_exec_idx[i] === row) {
        const boundaries = getStateBoundaries(txns, i);
        if (
          boundaries.length >= 2 &&
          within(
            getRelativeMs(boundaries[0]),
            getRelativeMs(boundaries[boundaries.length - 1]),
          )
        ) {
          return { slot: txns.slot[i], txnIdx: txns.txn_idx[i] };
        }
      }

      // Sigverify span on the sigverify row (may be a different tile).
      if (txns.txn_sigverify_exec_idx[i] === row) {
        const sigStart = txns.txn_sigverify_start_nanos[i];
        const sigEnd = txns.txn_sigverify_end_nanos[i];
        if (
          sigEnd > sigStart &&
          within(getRelativeMs(sigStart), getRelativeMs(sigEnd))
        ) {
          return { slot: txns.slot[i], txnIdx: txns.txn_idx[i] };
        }
      }
    }
  }

  return undefined;
}

function getStateBoundaries(txns: TxnTimestampColumns, i: number): bigint[] {
  const boundaries = [
    txns.txn_load_start_nanos[i],
    txns.txn_check_start_nanos[i],
    txns.txn_exec_start_nanos[i],
    txns.txn_commit_start_nanos[i],
    txns.txn_commit_end_nanos[i],
  ].filter((v): v is bigint => v !== undefined);

  return boundaries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function getStateAt(
  txns: TxnTimestampColumns,
  i: number,
  tsNs: bigint,
): TxnState {
  const checkStart = txns.txn_check_start_nanos[i];
  const execStart = txns.txn_exec_start_nanos[i];
  const commitStart = txns.txn_commit_start_nanos[i];

  // [load_start, check_start): Loading
  // [check_start, exec_start): Validate
  // [exec_start, commit_start): Execute
  // [commit_start, commit_end): Post-Execute
  if (checkStart !== undefined && tsNs < checkStart) return TxnState.LOADING;
  if (execStart !== undefined && tsNs < execStart) return TxnState.VALIDATE;
  if (commitStart !== undefined && tsNs < commitStart) return TxnState.EXECUTE;
  return TxnState.POST_EXECUTE;
}

function withAlpha(rgb: RgbColor, alpha: number): RgbaColor {
  return [rgb[0], rgb[1], rgb[2], Math.max(0, Math.min(1, alpha))];
}

function resolveStateColor(colorStr: string): RgbaColor {
  if (colorStr.startsWith("#")) {
    return withAlpha(convertToWebGlColor(colorStr), 1);
  }
  const match = colorStr.match(/rgba?\(([^)]+)\)/);
  if (!match) return withAlpha(convertToWebGlColor("#000000"), 1);
  const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
  const base: RgbColor = [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  const alpha = parts.length > 3 ? parts[3] : 1;
  return withAlpha(base, alpha);
}
