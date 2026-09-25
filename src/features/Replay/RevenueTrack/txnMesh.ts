import * as THREE from "three";
import {
  createUnitQuad,
  glslFloat,
  type RgbColor,
} from "../../WebGl/webglUtils.ts";
import {
  maxY,
  minHeightRatio,
  maxHeightRatio,
  nonAggMinAlpha,
  nonAggMaxAlpha,
  revenueExpBase,
  type RevenueScale,
} from "./consts.ts";

export interface TxnMesh {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  instanceArray: Float32Array;
  instanceAttr: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
  referenceX: number | undefined;
}

export interface TxnResources {
  material: THREE.RawShaderMaterial;
  unitQuad: THREE.BufferGeometry;
}

export const SCALE_UNIFORM = {
  linear: 1,
  power: 2,
  exp: 3,
} as const satisfies Record<RevenueScale, number>;

const INITIAL_CAPACITY = 2 ** 15;

const vertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

uniform float uMaxValue;
uniform float uMinBarMs;
uniform float uRows;
uniform int uScale;
uniform vec3 uColor;

attribute vec2 position;
attribute vec4 instance;

varying vec4 vColor;

const float MAX_Y = ${glslFloat(maxY)};
const float MIN_HEIGHT_RATIO = ${glslFloat(minHeightRatio)};
const float MAX_HEIGHT_RATIO = ${glslFloat(maxHeightRatio)};
const float MIN_ALPHA = ${glslFloat(nonAggMinAlpha)};
const float MAX_ALPHA = ${glslFloat(nonAggMaxAlpha)};
const float EXP_BASE = ${glslFloat(revenueExpBase)};

// Mirrors getRevenueRatio() in scale.ts
float revenueRatio(float value, float maxValue, float minRatio) {
  if (maxValue <= 0.0 || value <= 0.0) return 0.0;

  float normalized = value / maxValue;

  float ratio;
  if (uScale == ${SCALE_UNIFORM.linear}) {
    ratio = normalized;
  } else if (uScale == ${SCALE_UNIFORM.power}) {
    ratio = normalized * normalized;
  } else {
    ratio = (exp(EXP_BASE * normalized) - 1.0) / (exp(EXP_BASE) - 1.0);
  }

  return ratio == 0.0 ? 0.0 : clamp(ratio, minRatio, 1.0);
}

float revenueAlpha(float value, float maxValue) {
  if (maxValue <= 0.0 || value <= 0.0) return 0.0;
  float normalized = value / maxValue;
  // Quadratic falloff so low value txns fade faster and high value ones stand out
  return clamp(normalized * normalized, MIN_ALPHA, MAX_ALPHA);
}

void main() {
  float x = instance.x;
  float row = instance.y;
  float rawWidthMs = instance.z;
  float value = instance.w;

  // When txns are split across rows, cull any whose row is outside the visible range.
  // Cull the vertex by setting its position to one guaranteed outside the visible space.
  if (uRows > 1.0 && (uRows <= row || row < 0.0)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec4(0.0);
    return;
  }

  float width = max(rawWidthMs, uMinBarMs);
  float rowHeight = MAX_Y / uRows;
  // MAX_HEIGHT_RATIO leaves a gap at the top of each row for spacing
  float usableHeight = rowHeight * MAX_HEIGHT_RATIO;
  float height = usableHeight * revenueRatio(value, uMaxValue, MIN_HEIGHT_RATIO);

  float yPos = uRows > 1.0 ? (uRows - 1.0 - row) * rowHeight : 0.0;
  vec2 rect = vec2(width, height);
  vec2 world = position * rect + vec2(x, yPos) + rect * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);

  vColor = vec4(uColor, revenueAlpha(value, uMaxValue));
}
`;

const fragmentShader = /* glsl */ `
precision mediump float;
varying vec4 vColor;

void main() {
  gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a);
}
`;

export function createTxnResources(color: RgbColor): TxnResources {
  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    uniforms: {
      uMaxValue: { value: 0 },
      uMinBarMs: { value: 0 },
      uRows: { value: 1 },
      uScale: { value: SCALE_UNIFORM.linear },
      uColor: { value: new THREE.Vector3(color[0], color[1], color[2]) },
    },
  });
  return { material, unitQuad: createUnitQuad() };
}

export function disposeTxnResources(resources: TxnResources) {
  resources.material.dispose();
  resources.unitQuad.dispose();
}

export function createTxnMesh(resources: TxnResources): TxnMesh {
  const instanceArray = new Float32Array(INITIAL_CAPACITY * 4);
  const instanceAttr = new THREE.InstancedBufferAttribute(instanceArray, 4);
  instanceAttr.setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = resources.unitQuad.index;
  geometry.setAttribute(
    "position",
    resources.unitQuad.getAttribute("position"),
  );
  geometry.setAttribute("instance", instanceAttr);
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere();

  const mesh = new THREE.Mesh(geometry, resources.material);
  mesh.frustumCulled = false;

  return {
    mesh,
    geometry,
    instanceArray,
    instanceAttr,
    capacity: INITIAL_CAPACITY,
    count: 0,
    referenceX: undefined,
  };
}

export function setTxnMeshUniforms(
  resources: TxnResources,
  maxValue: number,
  minBarMs: number,
  rows: number,
  scale: RevenueScale,
) {
  const { uniforms } = resources.material;
  uniforms.uMaxValue.value = maxValue;
  uniforms.uMinBarMs.value = minBarMs;
  uniforms.uRows.value = Math.max(rows, 1);
  uniforms.uScale.value = SCALE_UNIFORM[scale];
}

export function ensureTxnCapacity(txnMesh: TxnMesh, needed: number) {
  if (needed <= txnMesh.capacity) return;

  let newCapacity = txnMesh.capacity || INITIAL_CAPACITY;
  while (newCapacity < needed) newCapacity *= 2;

  const instanceArray = new Float32Array(newCapacity * 4);
  instanceArray.set(txnMesh.instanceArray);

  txnMesh.instanceArray = instanceArray;
  txnMesh.instanceAttr = new THREE.InstancedBufferAttribute(instanceArray, 4);
  txnMesh.instanceAttr.setUsage(THREE.DynamicDrawUsage);
  txnMesh.capacity = newCapacity;

  txnMesh.geometry.setAttribute("instance", txnMesh.instanceAttr);
  // @ts-expect-error
  txnMesh.geometry._maxInstanceCount = undefined;
}

export function addTxnToMesh(
  txnMesh: TxnMesh,
  idx: number,
  x: number,
  row: number,
  rawWidthMs: number,
  value: number,
) {
  const i = idx * 4;
  txnMesh.instanceArray[i] = x;
  txnMesh.instanceArray[i + 1] = row;
  txnMesh.instanceArray[i + 2] = rawWidthMs;
  txnMesh.instanceArray[i + 3] = value;
}

export function updateTxnMeshCount(txnMesh: TxnMesh, count: number) {
  txnMesh.count = count;
  txnMesh.geometry.instanceCount = count;
  txnMesh.instanceAttr.needsUpdate = true;
}
