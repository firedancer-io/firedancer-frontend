import * as THREE from "three";
import { SHRED_EVENT_TYPES_COUNT } from "../../api/entities";
import type { ContextHelpers } from "./useWebGlEventHandlers";
import { isWebgl2SupportedAtom } from "./atoms";
import { getDefaultStore } from "jotai";

export type TsRange = [startTs: number, endTs: number];
export type NsTsRange = [startTs: bigint, endTs: bigint];
export type RgbColor = [r: number, g: number, b: number];
export type RgbaColor = [r: number, g: number, b: number, a: number];

export type RectMesh = {
  mesh: THREE.Mesh;
  rectArray: Float32Array;
  colorArray: Float32Array;
  rectAttr: THREE.InstancedBufferAttribute;
  colorAttr: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
  /** optionally store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  referenceX: number | undefined;
};

const vertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

attribute vec2 position;
attribute vec4 instanceRect;  // x, y, w, h in world space
attribute vec4 instanceColor; // r, g, b, a

varying vec4 vColor;

void main() {
  // position is unit quad: [(-0.5,-0.5), (0.5,-0.5), (-0.5,0.5), (0.5,0.5)]
  vec2 world = position * instanceRect.zw + instanceRect.xy + instanceRect.zw * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
  vColor = instanceColor;
}
`;

const fragmentShader = /* glsl */ `
precision mediump float;
varying vec4 vColor;

void main() {
  gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a);
}
`;

const DEFAULT_OUTLINE_PX = 1;

const outlineVertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform vec2 uResolution;     // drawing-buffer size in px

attribute vec2 position;
attribute vec4 instanceRect;  // x, y, w, h in world space
attribute vec4 instanceColor; // r, g, b, a

varying vec4 vColor;
varying vec2 vLocal;          // unit-quad local coord in [-0.5, 0.5]
varying vec2 vRectPx;         // instance size in screen px

void main() {
  vec2 world = position * instanceRect.zw + instanceRect.xy + instanceRect.zw * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
  vColor = instanceColor;
  vLocal = position;

  // Orthographic, axis-aligned: NDC-per-world = projectionMatrix diagonal.
  // px = ndcSize * 0.5 * resolution. modelViewMatrix only translates (no scale).
  vRectPx = abs(vec2(
    instanceRect.z * projectionMatrix[0][0],
    instanceRect.w * projectionMatrix[1][1]
  )) * 0.5 * uResolution;
}
`;

const outlineFragmentShader = /* glsl */ `
precision highp float;

uniform float uBorderPx;

varying vec4 vColor;
varying vec2 vLocal;
varying vec2 vRectPx;

void main() {
  // Distance to the nearest edge, in screen px, along each axis.
  vec2 distPx = (0.5 - abs(vLocal)) * vRectPx;
  float d = min(distPx.x, distPx.y);

  // Keep the outer uBorderPx pixels, fade over ~1px, discard the interior.
  float coverage = 1.0 - smoothstep(uBorderPx - 0.5, uBorderPx + 0.5, d);
  if (coverage <= 0.0) discard;

  // Premultiplied alpha (matches renderer's premultipliedAlpha + NormalBlending).
  gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a) * coverage;
}
`;

const store = getDefaultStore();

export function createRenderer(
  canvasWidth: number,
  canvasHeight: number,
  maxWebGlPixelRatio: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
) {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, maxWebGlPixelRatio),
    );
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setClearColor(0x000000, 0);

    const clearContextListeners = setUpContextListeners(renderer.domElement);
    const cleanUpRenderer = () => {
      // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
      // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
      // Three doesn't restore GPU objects for restored contexts unless there's a render.
      // Remount on restore to reset the context listeners state
      if (!getWasContextLost()) {
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
      cleanUpRenderer,
    };
  } catch {
    // context creation can still fail despite the probe (e.g. too many live
    // contexts, driver crash). Mark as unsupported to trigger fallback to canvas chart
    store.set(isWebgl2SupportedAtom, false);
  }
}

/**
 * Resources shared by all rect meshes of a single chart / renderer.
 * Compiled shaders / uploaded buffers are bound to a specific GL
 * context, so a fresh renderer (e.g. after a context loss) needs its own copy.
 */
export type WebglResources = {
  unitQuad: THREE.BufferGeometry;
  sharedMaterial: THREE.RawShaderMaterial;
  outlineMaterial: THREE.RawShaderMaterial;
};

function createUnitQuad() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      2,
    ),
  );
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.boundingSphere = new THREE.Sphere();
  return geometry;
}

function createSharedMaterial() {
  return new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
}

function createOutlineMaterial() {
  return new THREE.RawShaderMaterial({
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uBorderPx: { value: DEFAULT_OUTLINE_PX },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
  });
}

export function createWebglResources(): WebglResources {
  return {
    unitQuad: createUnitQuad(),
    sharedMaterial: createSharedMaterial(),
    outlineMaterial: createOutlineMaterial(),
  };
}

export function disposeWebglResources(resources: WebglResources) {
  resources.unitQuad.dispose();
  resources.sharedMaterial.dispose();
  resources.outlineMaterial.dispose();
}

// 700 shreds, all events except completion could have a rectangle
const INITIAL_CAPACITY = 700 * (SHRED_EVENT_TYPES_COUNT - 1);

/**
 * Create a mesh to draw 2D rectangles. Pass a material to draw with something
 * other than the default filled-rect shader (e.g. the outline material).
 */
export function createRectMesh(
  resources: WebglResources,
  initialCapacity = INITIAL_CAPACITY,
  material: THREE.RawShaderMaterial = resources.sharedMaterial,
): RectMesh {
  const rectArray = new Float32Array(initialCapacity * 4);
  const colorArray = new Float32Array(initialCapacity * 4);

  const rectAttr = new THREE.InstancedBufferAttribute(rectArray, 4);
  const colorAttr = new THREE.InstancedBufferAttribute(colorArray, 4);
  // DynamicDrawUsage to optimize for frequent updates
  rectAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = resources.unitQuad.index;
  geometry.setAttribute(
    "position",
    resources.unitQuad.getAttribute("position"),
  );
  geometry.setAttribute("instanceRect", rectAttr);
  geometry.setAttribute("instanceColor", colorAttr);
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    rectArray,
    colorArray,
    rectAttr,
    colorAttr,
    capacity: INITIAL_CAPACITY,
    count: 0,
    referenceX: undefined,
  };
}

/**
 * An outline mesh shares the filled-rect instance layout (so it reuses
 * ensureCapacity / addRectangleToMesh / updateRectMeshCount) but draws with the
 * SDF border material, rendering each instance as a constant-pixel-width frame.
 */
export function createOutlineMesh(resources: WebglResources): RectMesh {
  return createRectMesh(resources, INITIAL_CAPACITY, resources.outlineMaterial);
}

const tmpSize = new THREE.Vector2();
/** Set the outline border width (CSS px) and resolution (call per draw). */
export function updateOutlineUniforms(
  resources: WebglResources,
  renderer: THREE.WebGLRenderer,
  borderPx: number,
) {
  renderer.getDrawingBufferSize(tmpSize);
  const uniforms = resources.outlineMaterial.uniforms;
  uniforms.uBorderPx.value = borderPx * renderer.getPixelRatio();
  (uniforms.uResolution.value as THREE.Vector2).set(tmpSize.x, tmpSize.y);
}

/**
 * Bump up capacity for rect as needed
 */
export function ensureCapacity(rectMesh: RectMesh, needed: number) {
  if (needed <= rectMesh.capacity) return;

  let newCapacity = rectMesh.capacity || INITIAL_CAPACITY;
  while (newCapacity < needed) newCapacity *= 2;

  const rectArray = new Float32Array(newCapacity * 4);
  const colorArray = new Float32Array(newCapacity * 4);
  rectArray.set(rectMesh.rectArray);
  colorArray.set(rectMesh.colorArray);

  rectMesh.rectArray = rectArray;
  rectMesh.colorArray = colorArray;
  rectMesh.rectAttr = new THREE.InstancedBufferAttribute(rectArray, 4);
  rectMesh.colorAttr = new THREE.InstancedBufferAttribute(colorArray, 4);
  rectMesh.rectAttr.setUsage(THREE.DynamicDrawUsage);
  rectMesh.colorAttr.setUsage(THREE.DynamicDrawUsage);
  rectMesh.capacity = newCapacity;

  const geometry = rectMesh.mesh.geometry as THREE.InstancedBufferGeometry;
  geometry.setAttribute("instanceRect", rectMesh.rectAttr);
  geometry.setAttribute("instanceColor", rectMesh.colorAttr);
  // clear private field _maxInstanceCount for recomputation,
  // instead of allocating a new geometry
  // @ts-expect-error
  geometry._maxInstanceCount = undefined;
}

export function addRectangleToMesh(
  rectMesh: RectMesh,
  rectangleIdx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RgbColor | RgbaColor,
) {
  const ri = rectangleIdx * 4;
  rectMesh.rectArray[ri] = x;
  rectMesh.rectArray[ri + 1] = y;
  rectMesh.rectArray[ri + 2] = w;
  rectMesh.rectArray[ri + 3] = h;

  const ci = rectangleIdx * 4;
  rectMesh.colorArray[ci] = color[0];
  rectMesh.colorArray[ci + 1] = color[1];
  rectMesh.colorArray[ci + 2] = color[2];
  rectMesh.colorArray[ci + 3] = color[3] ?? 1;
}

export function updateRectMeshCount(rectMesh: RectMesh, count: number) {
  rectMesh.count = count;
  (rectMesh.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount =
    count;
  rectMesh.rectAttr.needsUpdate = true;
  rectMesh.colorAttr.needsUpdate = true;
}

/**
 * Mark a specific range as updated
 */
export function updateMeshRange(mesh: RectMesh, idxRange: [number, number]) {
  const startIdx = idxRange[0];
  const endIdx = Math.min(mesh.count - 1, idxRange[1]);
  const instanceCount = endIdx - startIdx + 1;
  if (instanceCount <= 0) return;

  mesh.rectAttr.clearUpdateRanges();
  mesh.rectAttr.addUpdateRange(startIdx * 4, instanceCount * 4);
  mesh.rectAttr.needsUpdate = true;

  mesh.colorAttr.clearUpdateRanges();
  mesh.colorAttr.addUpdateRange(startIdx * 4, instanceCount * 4);
  mesh.colorAttr.needsUpdate = true;
}

const tmpColor = new THREE.Color();
const tmpRgb = { r: 0, g: 0, b: 0 };
/**
 *
 * Convert hex color to sRGB values for the shader, instead of
 * Three.js's default linear working color space
 */
export function convertToWebGlColor(hex: string): RgbColor {
  tmpColor.setHex(parseInt(hex.replace("#", ""), 16), THREE.SRGBColorSpace);
  tmpColor.getRGB(tmpRgb, THREE.SRGBColorSpace);
  return [tmpRgb.r, tmpRgb.g, tmpRgb.b];
}
