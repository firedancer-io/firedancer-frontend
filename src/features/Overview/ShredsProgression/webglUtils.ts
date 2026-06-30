import * as THREE from "three";
import { SHRED_EVENT_TYPES_COUNT } from "../../../api/entities";

export type SlotMesh = {
  mesh: THREE.Mesh;
  rectArray: Float32Array;
  colorArray: Float32Array;
  rectAttr: THREE.InstancedBufferAttribute;
  colorAttr: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
};

const vertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

attribute vec2 position;
attribute vec4 instanceRect;  // x, y, w, h in world space
attribute vec3 instanceColor;

varying vec3 vColor;

void main() {
  // position is unit quad: [(-0.5,-0.5), (0.5,-0.5), (-0.5,0.5), (0.5,0.5)]
  vec2 world = position * instanceRect.zw + instanceRect.xy + instanceRect.zw * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
  vColor = instanceColor;
}
`;

const fragmentShader = /* glsl */ `
precision mediump float;
uniform float uOpacity;
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, uOpacity);
}
`;

const unitQuad = new THREE.BufferGeometry();
unitQuad.setAttribute(
  "position",
  new THREE.BufferAttribute(
    new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
    2,
  ),
);
unitQuad.setIndex([0, 1, 2, 1, 3, 2]);
unitQuad.boundingSphere = new THREE.Sphere();

const sharedMaterial = new THREE.RawShaderMaterial({
  vertexShader,
  fragmentShader,
  side: THREE.FrontSide,
  transparent: true,
  uniforms: {
    uOpacity: { value: 1 },
  },
});

// 700 shreds, all events except completion could have a rectangle
const INITIAL_CAPACITY = 700 * (SHRED_EVENT_TYPES_COUNT - 1);

/**
 * Create one mesh per slot. That way, we can easily add / delete slots without updating
 * unchanged slots.
 */
export function createSlotMesh(): SlotMesh {
  const rectArray = new Float32Array(INITIAL_CAPACITY * 4);
  const colorArray = new Float32Array(INITIAL_CAPACITY * 3);

  const rectAttr = new THREE.InstancedBufferAttribute(rectArray, 4);
  const colorAttr = new THREE.InstancedBufferAttribute(colorArray, 3);
  // DynamicDrawUsage to optimize for frequent updates
  rectAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = unitQuad.index;
  geometry.setAttribute("position", unitQuad.getAttribute("position"));
  geometry.setAttribute("instanceRect", rectAttr);
  geometry.setAttribute("instanceColor", colorAttr);
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere();

  const mesh = new THREE.Mesh(geometry, sharedMaterial);
  mesh.frustumCulled = false;

  return {
    mesh,
    rectArray,
    colorArray,
    rectAttr,
    colorAttr,
    capacity: INITIAL_CAPACITY,
    count: 0,
  };
}

/**
 * Bump up capacity for slot as needed
 */
export function ensureCapacity(slotMesh: SlotMesh, needed: number) {
  if (needed <= slotMesh.capacity) return;

  let newCapacity = slotMesh.capacity || INITIAL_CAPACITY;
  while (newCapacity < needed) newCapacity *= 2;

  const rectArray = new Float32Array(newCapacity * 4);
  const colorArray = new Float32Array(newCapacity * 3);
  rectArray.set(slotMesh.rectArray);
  colorArray.set(slotMesh.colorArray);

  slotMesh.rectArray = rectArray;
  slotMesh.colorArray = colorArray;
  slotMesh.rectAttr = new THREE.InstancedBufferAttribute(rectArray, 4);
  slotMesh.colorAttr = new THREE.InstancedBufferAttribute(colorArray, 3);
  slotMesh.rectAttr.setUsage(THREE.DynamicDrawUsage);
  slotMesh.colorAttr.setUsage(THREE.DynamicDrawUsage);
  slotMesh.capacity = newCapacity;

  const geometry = slotMesh.mesh.geometry as THREE.InstancedBufferGeometry;
  geometry.setAttribute("instanceRect", slotMesh.rectAttr);
  geometry.setAttribute("instanceColor", slotMesh.colorAttr);
}

export function addRectangleToMesh(
  slotMesh: SlotMesh,
  rectangleIdx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [r: number, g: number, b: number],
) {
  const ri = rectangleIdx * 4;
  slotMesh.rectArray[ri] = x;
  slotMesh.rectArray[ri + 1] = y;
  slotMesh.rectArray[ri + 2] = w;
  slotMesh.rectArray[ri + 3] = h;

  const ci = rectangleIdx * 3;
  slotMesh.colorArray[ci] = color[0];
  slotMesh.colorArray[ci + 1] = color[1];
  slotMesh.colorArray[ci + 2] = color[2];
}

export function updateSlotMeshCounts(slotMesh: SlotMesh, count: number) {
  slotMesh.count = count;
  (slotMesh.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount =
    count;
  slotMesh.rectAttr.needsUpdate = true;
  slotMesh.colorAttr.needsUpdate = true;
}

const tmpColor = new THREE.Color();
const tmpRgb = { r: 0, g: 0, b: 0 };
/**
 *
 * Convert hex color to sRGB values for the shader, instead of
 * Three.js's default linear working color space
 */
export function convertToWebGlColor(
  hex: string,
): [r: number, g: number, b: number] {
  tmpColor.setHex(parseInt(hex.replace("#", ""), 16), THREE.SRGBColorSpace);
  tmpColor.getRGB(tmpRgb, THREE.SRGBColorSpace);
  return [tmpRgb.r, tmpRgb.g, tmpRgb.b];
}
