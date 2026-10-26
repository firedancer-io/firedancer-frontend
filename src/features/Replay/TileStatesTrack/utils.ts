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
import type { Tile } from "../../../api/types.ts";
import {
  type TileStateColumns,
  type TileStatesTile,
} from "./tileStatesCache.ts";
import {
  createFillMaterial,
  createOutlineMaterial,
  setViewUniforms,
  updateOutlineUniforms,
} from "./tileStatesMesh.ts";
import {
  BAR_HEIGHT_PX,
  ROW_HEIGHT_PX,
  minY,
  maxY,
  FILL_ALPHA,
  OUTLINE_ALPHA,
  OUTLINE_BORDER_PX,
  OUTLINE_ERROR_RGB,
  OUTLINE_SUCCESS_RGB,
  tileStateColors,
  type ActiveTileState,
  type TileKind,
} from "./consts.ts";

type GetRelativeMs = (absoluteNs: bigint) => number;

export interface TileRow {
  tileIdx: number;
  label: string;
}

/** Track rows top-down: the tiles of `trackKind`, in `summary.tiles` order. */
export function getTileRows(
  tiles: Tile[] | undefined,
  trackKind: TileKind,
): TileRow[] {
  const rows: TileRow[] = [];
  tiles?.forEach(({ kind, kind_id }, tileIdx) => {
    if (kind === trackKind) rows.push({ tileIdx, label: `${kind} ${kind_id}` });
  });
  return rows;
}

/** Row per tile, keyed by index into `summary.tiles`. */
export type RowOfTile = Map<number, number>;

/**
 * One tile is rendered by its own pair of meshes: a fill mesh (state segments,
 * which share one opacity so they can share a mesh) and an outline mesh
 * (per-txn success/error borders). Each tile's geometry is built once in
 * tile-local time (relative to `referenceX`); pan/zoom only updates each mesh's
 * view uniforms, and a live tick appends to the single in-progress tile.
 */
interface TileMeshes {
  fill: RectMesh;
  outline: RectMesh;
  fillEdges: InstanceBuffer;
  outlineEdges: InstanceBuffer;
}

/**
 * A per-rect attribute beyond the shared rect layout: `instanceEdges`, the
 * tile-local start/end ms, each split into hi + lo float32s, for positions
 * finer than a single float32 resolves.
 */
interface InstanceBuffer {
  name: string;
  itemSize: number;
  array: Float32Array;
  attr: THREE.InstancedBufferAttribute;
}

function createInstanceBuffer(
  mesh: RectMesh,
  name: string,
  itemSize: number,
): InstanceBuffer {
  const array = new Float32Array(mesh.capacity * itemSize);
  const attr = new THREE.InstancedBufferAttribute(array, itemSize);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.mesh.geometry.setAttribute(name, attr);
  return { name, itemSize, array, attr };
}

/** Grow `buf` to the rect mesh's capacity; returns whether it reallocated. */
function ensureInstanceCapacity(mesh: RectMesh, buf: InstanceBuffer): boolean {
  if (buf.array.length >= mesh.capacity * buf.itemSize) return false;
  const array = new Float32Array(mesh.capacity * buf.itemSize);
  array.set(buf.array);
  buf.array = array;
  buf.attr = new THREE.InstancedBufferAttribute(array, buf.itemSize);
  buf.attr.setUsage(THREE.DynamicDrawUsage);
  mesh.mesh.geometry.setAttribute(buf.name, buf.attr);
  return true;
}

/** Upload rects `[start, count)` of `buf`. */
function uploadInstanceRange(
  buf: InstanceBuffer,
  start: number,
  count: number,
) {
  buf.attr.clearUpdateRanges();
  if (count <= start) return;
  buf.attr.addUpdateRange(start * buf.itemSize, (count - start) * buf.itemSize);
  buf.attr.needsUpdate = true;
}

// Visible edges stay within ~2 steps of the anchor, keeping their anchor-relative
// px well inside float32 precision (~0.01px at 2^17).
const ANCHOR_STEP_PX = 2 ** 16;

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  fillResources: RectResources;
  // Keyed by `${startNs}:${endNs}` so txn and batch tiles that share a startNs
  // (a batch tile is a multiple of a txn tile) never collide.
  tileMeshes: Map<string, TileMeshes>;
  availableMeshes: TileMeshes[];
  liveTileKey: string | undefined;
  /** ms per device px of the current view, and its left edge in whole px. */
  msPerPx: number;
  viewStartPx: number;
  lastVisibleRangeMs: TsRange | undefined;
  showOutlines: boolean;
  cleanUp: () => void;
}

function tileKey(tile: TileStatesTile): string {
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

  const tileMeshes = new Map<string, TileMeshes>();
  const availableMeshes: TileMeshes[] = [];

  const cleanUp = () => {
    // Skip GPU disposal if the context was lost (its objects are already gone).
    if (!getWasContextLost()) {
      for (const tm of tileMeshes.values()) disposeTileMeshes(tm);
      for (const tm of availableMeshes) disposeTileMeshes(tm);
      disposeRectResources(fillResources);
    }
    cleanUpRenderer();
  };

  const rendererObj: RendererObj = {
    renderer,
    camera,
    scene,
    fillResources,
    tileMeshes,
    availableMeshes,
    liveTileKey: undefined,
    msPerPx: 0,
    viewStartPx: 0,
    lastVisibleRangeMs: undefined,
    showOutlines: false,
    cleanUp,
  };

  refreshSizeUniforms(rendererObj);
  return rendererObj;
}

export function render(rendererObj: RendererObj) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

/** Refresh size-dependent uniforms (after size changes). */
export function refreshSizeUniforms(rendererObj: RendererObj) {
  const { tileMeshes, availableMeshes, renderer, lastVisibleRangeMs } =
    rendererObj;
  for (const tm of [...tileMeshes.values(), ...availableMeshes]) {
    updateOutlineUniforms(
      tm.outline.mesh.material as THREE.RawShaderMaterial,
      renderer,
      OUTLINE_BORDER_PX,
    );
  }
  // Edge positions depend on the drawing-buffer width.
  if (lastVisibleRangeMs) setVisibleRange(rendererObj, lastVisibleRangeMs);
}

/** Point every tile mesh at the new visible range (x is set in the shader). */
export function setVisibleRange(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { tileMeshes, renderer } = rendererObj;

  const durationMs = visibleRangeMs[1] - visibleRangeMs[0];
  const canvasPx = renderer.domElement.width;
  const msPerPx = canvasPx > 0 && durationMs > 0 ? durationMs / canvasPx : 0;

  // The view's left edge in whole px, so scrolling moves edges by whole px.
  rendererObj.msPerPx = msPerPx;
  rendererObj.viewStartPx =
    msPerPx > 0 ? Math.round(visibleRangeMs[0] / msPerPx) : 0;
  rendererObj.lastVisibleRangeMs = visibleRangeMs;

  for (const tm of tileMeshes.values()) positionTileMeshes(rendererObj, tm);
}

/** Update a tile's view uniforms for the current visible range. */
function positionTileMeshes(rendererObj: RendererObj, tm: TileMeshes) {
  const referenceX = tm.fill.referenceX;
  if (referenceX == null) return;
  const { msPerPx, viewStartPx, renderer } = rendererObj;

  // Anchor on the global pixel grid, moved only every ANCHOR_STEP_PX, so the
  // shader's inputs stay constant while the view scrolls by whole pixels.
  const anchorPx = Math.floor(viewStartPx / ANCHOR_STEP_PX) * ANCHOR_STEP_PX;
  const view = {
    msPerPx,
    viewWidthPx: renderer.domElement.width,
    anchorMs: anchorPx * msPerPx - referenceX,
    offsetPx: anchorPx - viewStartPx,
  };
  setViewUniforms(tm.fill.mesh.material as THREE.RawShaderMaterial, view);
  setViewUniforms(tm.outline.mesh.material as THREE.RawShaderMaterial, view);
}

/**
 * Builds meshes for newly cached tiles and pools the meshes of evicted ones.
 * Only new tiles are built — unchanged tiles keep their existing geometry.
 */
export function syncMeshes(
  rendererObj: RendererObj,
  tiles: TileStatesTile[],
  rowOfTile: RowOfTile,
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
    buildTileMeshes(rendererObj, tm, tile, rowOfTile, getRelativeMs);
  }

  for (const [key, tm] of tileMeshes) {
    if (seen.has(key) || key === liveTileKey) continue;
    tileMeshes.delete(key);
    poolTileMeshes(rendererObj, tm);
  }
}

/**
 * Add a live tick to the in-progress live tile: append just the new data when
 * its meshes already hold the rest, otherwise build the whole tile.
 */
export function appendLive(
  rendererObj: RendererObj,
  liveTile: TileStatesTile,
  newData: TileStateColumns,
  isNewTile: boolean,
  rowOfTile: RowOfTile,
  getRelativeMs: GetRelativeMs,
) {
  const { tileMeshes } = rendererObj;
  const key = tileKey(liveTile);
  const wasLive = rendererObj.liveTileKey === key;
  rendererObj.liveTileKey = key;

  const tm = tileMeshes.get(key);
  if (tm && wasLive && !isNewTile) {
    appendTileMeshes(tm, newData, rowOfTile);
    return;
  }
  const built = tm ?? acquireTileMeshes(rendererObj);
  tileMeshes.set(key, built);
  buildTileMeshes(rendererObj, built, liveTile, rowOfTile, getRelativeMs);
}

/** Clear the live flag once its tile has been committed (delivered via "add"). */
export function clearLiveIfAdded(
  rendererObj: RendererObj,
  addedTiles: TileStatesTile[],
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
 * Rebuilds all tiles from scratch. Needed when the row layout changes (tiles)
 * or the absolute→relative time mapping changes (reference ts).
 */
export function rebuildAll(
  rendererObj: RendererObj,
  tiles: TileStatesTile[],
  rowOfTile: RowOfTile,
  getRelativeMs: GetRelativeMs,
) {
  for (const [key, tm] of rendererObj.tileMeshes) {
    rendererObj.tileMeshes.delete(key);
    poolTileMeshes(rendererObj, tm);
  }
  rendererObj.liveTileKey = undefined;
  syncMeshes(rendererObj, tiles, rowOfTile, getRelativeMs);
}

function createTileMeshes(rendererObj: RendererObj): TileMeshes {
  const { fillResources, renderer } = rendererObj;
  const fill = createRectMesh(
    fillResources,
    undefined,
    createFillMaterial(FILL_ALPHA),
  );
  // The outline mesh reuses the shared instanced-rect layout with the SDF material.
  const outlineMaterial = createOutlineMaterial(
    OUTLINE_BORDER_PX,
    OUTLINE_ALPHA,
  );
  updateOutlineUniforms(outlineMaterial, renderer, OUTLINE_BORDER_PX);
  const outline = createRectMesh(fillResources, undefined, outlineMaterial);
  // Preserve layering regardless of scene insertion order: fill < outline.
  fill.mesh.renderOrder = 0;
  outline.mesh.renderOrder = 1;
  return {
    fill,
    outline,
    fillEdges: createInstanceBuffer(fill, "instanceEdges", 4),
    outlineEdges: createInstanceBuffer(outline, "instanceEdges", 4),
  };
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
  (tm.fill.mesh.material as THREE.Material).dispose();
  (tm.outline.mesh.material as THREE.Material).dispose();
}

// Precomputed RGB per state so the hot path never re-parses a color string
// (regex/split/parseFloat) per segment per rebuild.
const STATE_COLOR_RGB = Object.fromEntries(
  Object.entries(tileStateColors).map(([state, color]) => [
    state,
    resolveStateColor(color),
  ]),
) as Record<ActiveTileState, RgbColor>;

function buildTileMeshes(
  rendererObj: RendererObj,
  tm: TileMeshes,
  tile: TileStatesTile,
  rowOfTile: RowOfTile,
  getRelativeMs: GetRelativeMs,
) {
  const referenceX = getRelativeMs(tile.startNs);
  tm.fill.referenceX = referenceX;
  tm.outline.referenceX = referenceX;
  positionTileMeshes(rendererObj, tm);

  // Reserve once so per-rect capacity checks never trigger reallocating doublings.
  ensureRectCapacity(tm.fill, tile.data.state.length);
  ensureRectCapacity(tm.outline, tile.data.txn_idx.length);
  ensureInstanceCapacity(tm.fill, tm.fillEdges);
  ensureInstanceCapacity(tm.outline, tm.outlineEdges);
  const counts = writeRects(tm, tile.data, 0, 0, rowOfTile);

  updateRectMeshCounts(tm.fill, counts.fill);
  updateRectMeshCounts(tm.outline, counts.outline);
  uploadInstanceRange(tm.fillEdges, 0, counts.fill);
  uploadInstanceRange(tm.outlineEdges, 0, counts.outline);
}

/**
 * Append a live tile's newly fetched states after its existing rects,
 * uploading only the new range, so a live tick costs the new data rather than
 * the whole tile.
 */
function appendTileMeshes(
  tm: TileMeshes,
  newData: TileStateColumns,
  rowOfTile: RowOfTile,
) {
  const fillStart = tm.fill.count;
  const outlineStart = tm.outline.count;
  const fillArray = tm.fill.rectArray;
  const outlineArray = tm.outline.rectArray;
  ensureRectCapacity(tm.fill, fillStart + newData.state.length);
  ensureRectCapacity(tm.outline, outlineStart + newData.txn_idx.length);
  const fillEdgesGrew = ensureInstanceCapacity(tm.fill, tm.fillEdges);
  const outlineEdgesGrew = ensureInstanceCapacity(tm.outline, tm.outlineEdges);
  const counts = writeRects(tm, newData, fillStart, outlineStart, rowOfTile);

  // A reallocated buffer is a new attribute, so it needs a full upload.
  if (tm.fill.rectArray === fillArray) {
    updateRectMeshRange(tm.fill, fillStart, counts.fill);
  } else {
    updateRectMeshCounts(tm.fill, counts.fill);
  }
  if (tm.outline.rectArray === outlineArray) {
    updateRectMeshRange(tm.outline, outlineStart, counts.outline);
  } else {
    updateRectMeshCounts(tm.outline, counts.outline);
  }
  uploadInstanceRange(tm.fillEdges, fillEdgesGrew ? 0 : fillStart, counts.fill);
  uploadInstanceRange(
    tm.outlineEdges,
    outlineEdgesGrew ? 0 : outlineStart,
    counts.outline,
  );
}

/** Set the drawn count and upload only rects `[start, count)`. */
function updateRectMeshRange(mesh: RectMesh, start: number, count: number) {
  mesh.count = count;
  (mesh.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = count;
  if (count <= start) return;
  for (const attr of [mesh.rectAttr, mesh.colorAttr]) {
    attr.clearUpdateRanges();
    attr.addUpdateRange(start * attr.itemSize, (count - start) * attr.itemSize);
    attr.needsUpdate = true;
  }
}

/** Write rects for `data` starting at the given indices; returns the new counts. */
function writeRects(
  tm: TileMeshes,
  data: TileStateColumns,
  fillStart: number,
  outlineStart: number,
  rowOfTile: RowOfTile,
): { fill: number; outline: number } {
  let fillCount = fillStart;
  let outlineCount = outlineStart;

  if (rowOfTile.size === 0) return { fill: fillCount, outline: outlineCount };
  const rowH = 1 / rowOfTile.size;
  const barH = (rowH * BAR_HEIGHT_PX) / ROW_HEIGHT_PX;

  for (let i = 0; i < data.state.length; i++) {
    const row = rowOfTile.get(data.state_tile[i]);
    if (row === undefined) continue;
    fillCount = pushRect(
      tm.fill,
      tm.fillEdges,
      fillCount,
      data.state_start_ms[i],
      data.state_end_ms[i],
      tileYPosition(row, rowH),
      barH,
      STATE_COLOR_RGB[data.state[i] as ActiveTileState],
    );
  }

  for (let i = 0; i < data.txn_idx.length; i++) {
    const row = rowOfTile.get(data.txn_tile[i]);
    // Only execution segments get an outline; sigverify's error code is null.
    const errorCode = data.txn_error_code[i];
    if (row === undefined || errorCode === null) continue;
    outlineCount = pushRect(
      tm.outline,
      tm.outlineEdges,
      outlineCount,
      data.txn_start_ms[i],
      data.txn_end_ms[i],
      tileYPosition(row, rowH),
      barH,
      errorCode ? OUTLINE_ERROR_RGB : OUTLINE_SUCCESS_RGB,
    );
  }
  return { fill: fillCount, outline: outlineCount };
}

function pushRect(
  mesh: RectMesh,
  edges: InstanceBuffer,
  idx: number,
  startMs: number,
  endMs: number,
  y0: number,
  h: number,
  color: RgbColor,
): number {
  ensureRectCapacity(mesh, idx + 1);
  ensureInstanceCapacity(mesh, edges);
  const localStart = startMs - (mesh.referenceX ?? 0);
  const localEnd = endMs - (mesh.referenceX ?? 0);
  addRectangleToMesh(
    mesh,
    idx,
    localStart,
    y0,
    localEnd - localStart,
    h,
    color,
  );

  const startHi = Math.fround(localStart);
  const endHi = Math.fround(localEnd);
  const i = idx * 4;
  edges.array[i] = startHi;
  edges.array[i + 1] = localStart - startHi;
  edges.array[i + 2] = endHi;
  edges.array[i + 3] = localEnd - endHi;
  return idx + 1;
}

/** Bottom y of a row, rows stacked top-down. */
function tileYPosition(row: number, rowH: number) {
  return 1 - (row + 1) * rowH;
}

/** Parse a "#hex" or "rgba(r,g,b,a)" color string to an RGB triple for the shader. */
function resolveStateColor(colorStr: string): RgbColor {
  if (colorStr.startsWith("#")) return convertToWebGlColor(colorStr);
  const match = colorStr.match(/rgba?\(([^)]+)\)/);
  if (!match) return [0, 0, 0];
  const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}
