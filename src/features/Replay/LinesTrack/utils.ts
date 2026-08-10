import { getDefaultStore } from "jotai";
import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import type { ReplayLine } from "../../../atoms.ts";
import type { RgbColor, TsRange } from "../const.ts";
import { isWebgl2SupportedAtom } from "../../WebGl/atoms.ts";

const store = getDefaultStore();

const minY = 0;
const maxY = 1;
const LINE_WIDTH_PX = 2;

/**
 * Distinct colors per mock line. sRGB values (matches other tracks' color space).
 */
const LINE_COLORS: RgbColor[] = [
  [116 / 255, 178 / 255, 238 / 255],
  [238 / 255, 146 / 255, 116 / 255],
  [146 / 255, 238 / 255, 155 / 255],
];

type LineObj = {
  line: Line2;
  geometry: LineGeometry;
  /**
   * origin ms subtracted from this line's point x coordinates so the GPU works
   * with small, float32-precise coordinates instead of ~3.4e8. Set when the
   * geometry is (re)built; used to derive line.position.x as the camera moves.
   */
  referenceX: number | undefined;
};

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  materials: LineMaterial[];
  lines: LineObj[];
  /**
   * origin ms subtracted from the camera bounds so the GPU works with small,
   * float32-precise coordinates instead of ~3.4e8.
   */
  cameraReferenceMs: number;
  /**
   * Last data + projector, cached so the camera can rebuild geometry on move.
   * Line2's vertex shader computes normalize(ndcEnd - ndcStart); if the geometry
   * is only translated via line.position.x (which grows to ~1e5 as you pan/zoom
   * out), that subtraction loses float32 precision and segments collapse to
   * nothing. Rebuilding relative to the current camera keeps shader inputs small.
   */
  lastData: ReplayLine[] | undefined;
  lastGetRelativeMs: ((absoluteMs: number) => number) | undefined;
  cleanUpRenderer: () => void;
};

function createMaterial(color: RgbColor, width: number, height: number) {
  const material = new LineMaterial({
    color: new THREE.Color(color[0], color[1], color[2]),
    linewidth: LINE_WIDTH_PX,
    worldUnits: false,
    transparent: true,
  });
  material.resolution.set(width, height);
  return material;
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

    const materials = LINE_COLORS.map((color) =>
      createMaterial(color, canvasWidth, canvasHeight),
    );

    const clearContextListeners = setUpContextListeners(renderer.domElement);

    const lines: LineObj[] = [];

    const cleanUpRenderer = () => {
      // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
      // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
      // Three doesn't restore GPU objects for restored contexts unless there's a render.
      // Remount on restore to reset the context listeners state
      if (!getWasContextLost()) {
        for (const lineObj of lines) {
          lineObj.geometry.dispose();
        }
        for (const material of materials) {
          material.dispose();
        }
        renderer.dispose();
      }

      // release currently live context (may be the restored one)
      // make sure context listeners are removed beforehand
      clearContextListeners();
      if (!renderer.getContext().isContextLost()) {
        renderer.forceContextLoss();
      }
    };

    return {
      renderer,
      camera,
      scene,
      materials,
      lines,
      cameraReferenceMs: 0,
      lastData: undefined,
      lastGetRelativeMs: undefined,
      cleanUpRenderer,
    };
  } catch {
    // context creation can still fail despite the probe (e.g. too many live
    // contexts, driver crash). Mark as unsupported to trigger fallback to canvas chart
    store.set(isWebgl2SupportedAtom, false);
  }
}

export function render(rendererObj: RendererObj) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

/**
 * Rebuild line geometries from data, projected relative to the current camera
 * reference so shader coordinates stay small (see note on RendererObj.lastData).
 * Caches the data so moveCamera can re-project on pan/zoom.
 */
export function drawLines(
  rendererObj: RendererObj,
  data: ReplayLine[],
  getRelativeMs: (absoluteMs: number) => number,
) {
  rendererObj.lastData = data;
  rendererObj.lastGetRelativeMs = getRelativeMs;
  projectLines(rendererObj);
}

/**
 * (Re)build geometry for the cached data at the current cameraReferenceMs.
 * Positions are stored relative to cameraReferenceMs so line.position.x is
 * always 0 — this keeps Line2's shader inputs small and float32-precise.
 */
function projectLines(rendererObj: RendererObj) {
  const { cameraReferenceMs, scene, materials, lines, lastData } = rendererObj;
  const getRelativeMs = rendererObj.lastGetRelativeMs;
  if (!lastData || !getRelativeMs) return;

  for (let lineIdx = 0; lineIdx < lastData.length; lineIdx++) {
    const points = lastData[lineIdx];

    // A polyline needs at least two points to draw a segment.
    if (points.length < 2) {
      const existing = lines[lineIdx];
      if (existing) scene.remove(existing.line);
      continue;
    }

    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = getRelativeMs(points[i].tsMs) - cameraReferenceMs;
      positions[i * 3 + 1] = points[i].value / 100;
      positions[i * 3 + 2] = 0;
    }

    let lineObj = lines[lineIdx];
    if (!lineObj) {
      const geometry = new LineGeometry();
      const material = materials[lineIdx % materials.length];
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      lineObj = { line, geometry, referenceX: undefined };
      lines[lineIdx] = lineObj;
    }

    lineObj.geometry.setPositions(positions);
    // setPositions recomputes a bounding sphere; force an infinite one so the
    // line is never frustum-culled on a stale bound.
    lineObj.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      Infinity,
    );
    // Three caches _maxInstanceCount on first render and clamps draws to it. When
    // the point count grows (zoom out => more segments), the extra (right-side)
    // segments get clipped unless we clear the cache so it recomputes. Same fix
    // as the rectangle mesh in webglUtils.
    // @ts-expect-error private field
    lineObj.geometry._maxInstanceCount = undefined;
    lineObj.referenceX = cameraReferenceMs;
    lineObj.line.position.x = 0;
    scene.add(lineObj.line);
  }

  // remove any lines that no longer have data
  for (let lineIdx = lastData.length; lineIdx < lines.length; lineIdx++) {
    const lineObj = lines[lineIdx];
    if (lineObj) scene.remove(lineObj.line);
  }
}

/**
 * Update every line material's resolution so pixel-space line width stays correct.
 * Must be called whenever the canvas size changes.
 */
export function setResolution(
  rendererObj: RendererObj,
  width: number,
  height: number,
) {
  for (const material of rendererObj.materials) {
    material.resolution.set(width, height);
  }
}

/**
 * Move the camera to a new visible range and re-project the lines against the
 * new reference.
 *
 * We rebuild geometry (relative to the new cameraReferenceMs) rather than just
 * translating via line.position.x. Line2's vertex shader computes
 * normalize(ndcEnd - ndcStart); a large position.x (which grows to ~1e5 when
 * panned/zoomed far from the draw-time reference) pushes those NDC coordinates
 * into a range where the subtraction loses float32 precision, collapsing
 * segments to nothing (the right/large-x side fails first). Keeping position.x
 * at 0 and the buffer coordinates small avoids that.
 */
export function moveCamera(rendererObj: RendererObj, visibleRangeMs: TsRange) {
  const { camera } = rendererObj;

  // Store a camera reference to make line coordinates smaller for GPU
  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  // Re-project cached data against the new reference so shader inputs stay small.
  projectLines(rendererObj);
}
