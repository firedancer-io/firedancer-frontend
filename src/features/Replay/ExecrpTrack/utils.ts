import * as THREE from "three";
import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import {
  createRenderer,
  createRectResources,
  createRectMesh,
  disposeRectResources,
  ensureRectCapacity,
  addRectangleToMesh,
  updateRectMeshCounts,
  convertToWebGlColor,
  type RectResources,
  type RectMesh,
  type RgbColor,
  type TsRange,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import {
  stateColors,
  TxnState,
} from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";
import type {
  TxnTimestampColumns,
  TxnTimestampTile,
} from "./txnTimestampsCache.ts";
import {
  createOutlineMaterial,
  disposeOutlineMaterial,
  updateOutlineUniforms,
} from "./execrpMesh.ts";
import {
  ROW_FILL,
  minY,
  maxY,
  FILL_ALPHA,
  OUTLINE_ALPHA,
  OUTLINE_BORDER_PX,
  OUTLINE_ERROR_RGB,
  OUTLINE_SUCCESS_RGB,
  SIGVERIFY_RGB,
} from "./consts.ts";

type GetRelativeMs = (absoluteNs: bigint) => number;

/**
 * One tile is rendered by its own pair of meshes: a fill mesh (sigverify bars +
 * execution state segments, which share one opacity so they can share a mesh) and
 * an outline mesh (success/error borders). Each tile's geometry is built once and
 * positioned at absolute time via `referenceX`, so pan/zoom only moves the camera
 * (O(1)) and a live tick rebuilds just the single in-progress tile.
 */
interface TileMeshes {
  fill: RectMesh;
  outline: RectMesh;
}

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  fillResources: RectResources;
  outlineMaterial: THREE.RawShaderMaterial;
  // Keyed by `${startNs}:${endNs}` so txn and batch tiles that share a startNs
  // (a batch tile is a multiple of a txn tile) never collide.
  tileMeshes: Map<string, TileMeshes>;
  availableMeshes: TileMeshes[];
  liveTileKey: string | undefined;
  cameraReferenceMs: number;
  showOutlines: boolean;
  cleanUp: () => void;
}

function tileKey(tile: TxnTimestampTile): string {
  return `${tile.startNs}:${tile.endNs}`;
}

export function setUpRenderer(
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const created = createRenderer(
    canvasWidth,
    canvasHeight,
    MAX_WEBGL_PX_RATIO,
    setUpContextListeners,
    getWasContextLost,
  );
  if (!created) return;
  const { renderer, cleanUpRenderer } = created;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const fillResources = createRectResources(FILL_ALPHA);
  const outlineMaterial = createOutlineMaterial(
    OUTLINE_BORDER_PX,
    OUTLINE_ALPHA,
  );

  const tileMeshes = new Map<string, TileMeshes>();
  const availableMeshes: TileMeshes[] = [];

  const cleanUp = () => {
    // Skip GPU disposal if the context was lost (its objects are already gone).
    if (!getWasContextLost()) {
      for (const tm of tileMeshes.values()) disposeTileMeshes(tm);
      for (const tm of availableMeshes) disposeTileMeshes(tm);
      disposeRectResources(fillResources);
      disposeOutlineMaterial(outlineMaterial);
    }
    cleanUpRenderer();
  };

  const rendererObj: RendererObj = {
    renderer,
    camera,
    scene,
    fillResources,
    outlineMaterial,
    tileMeshes,
    availableMeshes,
    liveTileKey: undefined,
    cameraReferenceMs: 0,
    showOutlines: true,
    cleanUp,
  };

  refreshOutlineUniforms(rendererObj);
  return rendererObj;
}

export function render(rendererObj: RendererObj) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

/** Refresh the outline shader's resolution/border uniforms (after size changes). */
export function refreshOutlineUniforms(rendererObj: RendererObj) {
  updateOutlineUniforms(
    rendererObj.outlineMaterial,
    rendererObj.renderer,
    OUTLINE_BORDER_PX,
  );
}

/** Move the camera and re-anchor every tile mesh to the new camera reference. */
export function moveCamera(rendererObj: RendererObj, visibleRangeMs: TsRange) {
  const { camera, tileMeshes, renderer } = rendererObj;

  const durationMs = visibleRangeMs[1] - visibleRangeMs[0];

  // Snap the left edge to the device-pixel grid so live scrolling advances in
  // whole-pixel steps. With continuous subpixel motion the antialiased bar and
  // SDF outline edges recompute coverage every frame, which reads as shimmer;
  // snapping keeps each bar at a constant subpixel phase (<1px view shift).
  const canvasPx = renderer.domElement.width;
  const msPerPx = canvasPx > 0 && durationMs > 0 ? durationMs / canvasPx : 0;
  const startMs =
    msPerPx > 0
      ? Math.round(visibleRangeMs[0] / msPerPx) * msPerPx
      : visibleRangeMs[0];

  // The snapped left edge doubles as the camera reference (keeps GPU coords small).
  rendererObj.cameraReferenceMs = startMs;
  camera.left = 0;
  camera.right = durationMs;
  camera.updateProjectionMatrix();

  for (const tm of tileMeshes.values()) {
    if (tm.fill.referenceX != null) {
      tm.fill.mesh.position.x = tm.fill.referenceX - startMs;
    }
    if (tm.outline.referenceX != null) {
      tm.outline.mesh.position.x = tm.outline.referenceX - startMs;
    }
  }
}

/**
 * Builds meshes for newly cached tiles and pools the meshes of evicted ones.
 * Only new tiles are built — unchanged tiles keep their existing geometry.
 */
export function syncMeshes(
  rendererObj: RendererObj,
  tiles: TxnTimestampTile[],
  execrpCount: number,
  getRelativeMs: GetRelativeMs,
) {
  const { tileMeshes, liveTileKey } = rendererObj;

  const seen = new Set<string>();
  for (const tile of tiles) {
    const key = tileKey(tile);
    seen.add(key);
    if (tileMeshes.has(key)) continue;
    const tm = acquireTileMeshes(rendererObj);
    tileMeshes.set(key, tm);
    buildTileMeshes(
      tm,
      tile,
      execrpCount,
      getRelativeMs,
      rendererObj.cameraReferenceMs,
    );
  }

  for (const [key, tm] of tileMeshes) {
    if (seen.has(key) || key === liveTileKey) continue;
    tileMeshes.delete(key);
    poolTileMeshes(rendererObj, tm);
  }
}

/** (Re)build the single in-progress live tile's meshes. Cheap — one tile. */
export function appendLive(
  rendererObj: RendererObj,
  liveTile: TxnTimestampTile,
  execrpCount: number,
  getRelativeMs: GetRelativeMs,
) {
  const { tileMeshes } = rendererObj;
  const key = tileKey(liveTile);
  rendererObj.liveTileKey = key;

  let tm = tileMeshes.get(key);
  if (!tm) {
    tm = acquireTileMeshes(rendererObj);
    tileMeshes.set(key, tm);
  }
  buildTileMeshes(
    tm,
    liveTile,
    execrpCount,
    getRelativeMs,
    rendererObj.cameraReferenceMs,
  );
}

/** Clear the live flag once its tile has been committed (delivered via "add"). */
export function clearLiveIfAdded(
  rendererObj: RendererObj,
  addedTiles: TxnTimestampTile[],
) {
  const { liveTileKey } = rendererObj;
  if (liveTileKey == null) return;
  if (addedTiles.some((t) => tileKey(t) === liveTileKey)) {
    rendererObj.liveTileKey = undefined;
  }
}

export function clearLive(rendererObj: RendererObj) {
  rendererObj.liveTileKey = undefined;
}

/**
 * Rebuilds all tiles from scratch. Needed when the row layout changes (execrp
 * tile count) or the absolute→relative time mapping changes (reference ts).
 */
export function rebuildAll(
  rendererObj: RendererObj,
  tiles: TxnTimestampTile[],
  execrpCount: number,
  getRelativeMs: GetRelativeMs,
) {
  for (const [key, tm] of rendererObj.tileMeshes) {
    rendererObj.tileMeshes.delete(key);
    poolTileMeshes(rendererObj, tm);
  }
  rendererObj.liveTileKey = undefined;
  syncMeshes(rendererObj, tiles, execrpCount, getRelativeMs);
}

function createTileMeshes(rendererObj: RendererObj): TileMeshes {
  const { fillResources, outlineMaterial } = rendererObj;
  const fill = createRectMesh(fillResources);
  // The outline mesh reuses the shared instanced-rect layout with the SDF material.
  const outline = createRectMesh(fillResources, undefined, outlineMaterial);
  // Preserve layering regardless of scene insertion order: fill < outline.
  fill.mesh.renderOrder = 0;
  outline.mesh.renderOrder = 1;
  return { fill, outline };
}

function acquireTileMeshes(rendererObj: RendererObj): TileMeshes {
  const tm = rendererObj.availableMeshes.pop() ?? createTileMeshes(rendererObj);
  tm.outline.mesh.visible = rendererObj.showOutlines;
  rendererObj.scene.add(tm.fill.mesh, tm.outline.mesh);
  return tm;
}

/** Toggle the per-txn outline meshes without rebuilding geometry. */
export function setOutlinesVisible(rendererObj: RendererObj, visible: boolean) {
  rendererObj.showOutlines = visible;
  for (const tm of rendererObj.tileMeshes.values()) {
    tm.outline.mesh.visible = visible;
  }
}

function poolTileMeshes(rendererObj: RendererObj, tm: TileMeshes) {
  rendererObj.scene.remove(tm.fill.mesh, tm.outline.mesh);
  rendererObj.availableMeshes.push(tm);
}

function disposeTileMeshes(tm: TileMeshes) {
  tm.fill.mesh.geometry.dispose();
  tm.outline.mesh.geometry.dispose();
}

// Precomputed RGB per lifecycle state so the hot path never re-parses a color
// string (regex/split/parseFloat) per segment per txn per rebuild.
const STATE_COLOR_RGB: Record<TxnState, RgbColor> = {
  [TxnState.DEFAULT]: resolveStateColor(stateColors[TxnState.DEFAULT]),
  [TxnState.PRELOADING]: resolveStateColor(stateColors[TxnState.PRELOADING]),
  [TxnState.VALIDATE]: resolveStateColor(stateColors[TxnState.VALIDATE]),
  [TxnState.LOADING]: resolveStateColor(stateColors[TxnState.LOADING]),
  [TxnState.EXECUTE]: resolveStateColor(stateColors[TxnState.EXECUTE]),
  [TxnState.POST_EXECUTE]: resolveStateColor(
    stateColors[TxnState.POST_EXECUTE],
  ),
};

// Reusable scratch for one txn's lifecycle boundaries (≤5), avoiding a per-txn
// array allocation + sort. Safe because rendering is synchronous.
const stageMs = new Array<number>(5);
const stageState = new Array<TxnState>(5);

interface RectCounts {
  fill: number;
  outline: number;
}

function buildTileMeshes(
  tm: TileMeshes,
  tile: TxnTimestampTile,
  execrpCount: number,
  getRelativeMs: GetRelativeMs,
  cameraReferenceMs: number,
) {
  const referenceX = getRelativeMs(tile.startNs);
  tm.fill.referenceX = referenceX;
  tm.fill.mesh.position.x = referenceX - cameraReferenceMs;
  tm.outline.referenceX = referenceX;
  tm.outline.mesh.position.x = referenceX - cameraReferenceMs;

  const counts: RectCounts = { fill: 0, outline: 0 };

  if (execrpCount > 0) {
    const rowH = 1 / execrpCount;
    const barH = rowH * ROW_FILL;
    const txns = tile.data;
    const txnCount = txns.txn_exec_idx.length;
    // Reserve once (upper bound: ≤1 sig + ≤4 state fill rects, ≤2 outline rects
    // per txn) so per-rect capacity checks never trigger reallocating doublings.
    ensureRectCapacity(tm.fill, txnCount * 5);
    ensureRectCapacity(tm.outline, txnCount * 2);
    for (let i = 0; i < txnCount; i++) {
      appendTxn(
        txns,
        i,
        execrpCount,
        rowH,
        barH,
        getRelativeMs,
        tm.fill,
        tm.outline,
        counts,
      );
    }
  }

  updateRectMeshCounts(tm.fill, counts.fill);
  updateRectMeshCounts(tm.outline, counts.outline);
}

function pushRect(
  mesh: RectMesh,
  idx: number,
  startMs: number,
  endMs: number,
  y0: number,
  h: number,
  color: RgbColor,
): number {
  ensureRectCapacity(mesh, idx + 1);
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

/** Bottom y of a row, rows stacked top-down by tile index. */
function tileYPosition(execrp: number, rowH: number) {
  return 1 - (execrp + 1) * rowH;
}

function appendTxn(
  txns: TxnTimestampColumns,
  i: number,
  execrpCount: number,
  rowH: number,
  barH: number,
  getRelativeMs: GetRelativeMs,
  fillMesh: RectMesh,
  outlineMesh: RectMesh,
  counts: RectCounts,
): void {
  const outlineColor =
    txns.txn_error_code[i] !== 0 ? OUTLINE_ERROR_RGB : OUTLINE_SUCCESS_RGB;

  // Sigverify bar on the sigverify row (may be a different tile than execution).
  const sigExecrp = txns.txn_sigverify_exec_idx[i];
  const sigStart = txns.txn_sigverify_start_nanos[i];
  const sigEnd = txns.txn_sigverify_end_nanos[i];
  if (sigExecrp >= 0 && sigExecrp < execrpCount && sigEnd > sigStart) {
    const y = tileYPosition(sigExecrp, rowH);
    const s = getRelativeMs(sigStart);
    const e = getRelativeMs(sigEnd);
    counts.fill = pushRect(fillMesh, counts.fill, s, e, y, barH, SIGVERIFY_RGB);
    counts.outline = pushRect(
      outlineMesh,
      counts.outline,
      s,
      e,
      y,
      barH,
      outlineColor,
    );
  }

  // Lifecycle state segments on the execution row.
  const execrp = txns.txn_exec_idx[i];
  if (execrp < 0 || execrp >= execrpCount) return;
  const rowBottom = tileYPosition(execrp, rowH);

  // Present boundaries in lifecycle order into scratch (load_start & commit_end
  // are always present; intermediate stages may be null). No sort needed — the
  // non-null stage timestamps retain lifecycle order.
  let n = 0;
  stageMs[n] = getRelativeMs(txns.txn_load_start_nanos[i]);
  stageState[n] = TxnState.LOADING;
  n++;
  const check = txns.txn_check_start_nanos[i];
  if (check !== undefined) {
    stageMs[n] = getRelativeMs(check);
    stageState[n] = TxnState.VALIDATE;
    n++;
  }
  const exec = txns.txn_exec_start_nanos[i];
  if (exec !== undefined) {
    stageMs[n] = getRelativeMs(exec);
    stageState[n] = TxnState.EXECUTE;
    n++;
  }
  const commitStart = txns.txn_commit_start_nanos[i];
  if (commitStart !== undefined) {
    stageMs[n] = getRelativeMs(commitStart);
    stageState[n] = TxnState.POST_EXECUTE;
    n++;
  }
  stageMs[n] = getRelativeMs(txns.txn_commit_end_nanos[i]); // trailing end boundary
  n++;

  for (let b = 0; b < n - 1; b++) {
    const l = stageMs[b];
    const r = stageMs[b + 1];
    if (r <= l) continue;
    counts.fill = pushRect(
      fillMesh,
      counts.fill,
      l,
      r,
      rowBottom,
      barH,
      STATE_COLOR_RGB[stageState[b]],
    );
  }

  const spanStart = stageMs[0];
  const spanEnd = stageMs[n - 1];
  if (spanEnd > spanStart) {
    counts.outline = pushRect(
      outlineMesh,
      counts.outline,
      spanStart,
      spanEnd,
      rowBottom,
      barH,
      outlineColor,
    );
  }
}

/** Parse a "#hex" or "rgba(r,g,b,a)" color string to an RGB triple for the shader. */
function resolveStateColor(colorStr: string): RgbColor {
  if (colorStr.startsWith("#")) return convertToWebGlColor(colorStr);
  const match = colorStr.match(/rgba?\(([^)]+)\)/);
  if (!match) return [0, 0, 0];
  const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}
