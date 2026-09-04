import * as THREE from "three";
import { revenueLogBase } from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";
import {
  createUnitQuad,
  glslFloat,
  type RgbColor,
} from "../../WebGl/webglUtils.ts";
import {
  viewMaxY,
  minHeightRatio,
  rowGapRatio,
  nonAggMinAlpha,
  nonAggMaxAlpha,
  revenueExpBase,
  type RevenueScale,
} from "./consts.ts";

export interface TxnMesh {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.RawShaderMaterial;
  instanceArray: Float32Array;
  instanceAttr: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
  referenceX: number | undefined;
}

export const SCALE_UNIFORM = {
  banks: 0,
  linear: 1,
  power: 2,
  exp: 3,
} as const satisfies Record<RevenueScale, number>;

const INITIAL_CAPACITY = 4096;

const vertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

uniform float uMaxValue;
uniform float uMinBarMs;
uniform float uRows;
uniform int uScale;
uniform float uLogBase;
uniform vec3 uColor;

attribute vec2 position;
attribute vec4 instance;

varying vec4 vColor;

const float MAX_Y = ${glslFloat(viewMaxY)};
const float MIN_HEIGHT_RATIO = ${glslFloat(minHeightRatio)};
const float ROW_GAP_RATIO = ${glslFloat(rowGapRatio)};
const float MIN_ALPHA = ${glslFloat(nonAggMinAlpha)};
const float MAX_ALPHA = ${glslFloat(nonAggMaxAlpha)};
const float EXP_BASE = ${glslFloat(revenueExpBase)};

float revenueRatio(float value, float maxValue, float minRatio) {
  if (maxValue <= 0.0 || value <= 0.0) return 0.0;

  float normalized = value / maxValue;

  float ratio;
  if (uScale == ${SCALE_UNIFORM.linear}) {
    ratio = normalized;
  } else if (uScale == ${SCALE_UNIFORM.power}) {
    ratio = normalized * normalized;
  } else if (uScale == ${SCALE_UNIFORM.exp}) {
    ratio = (exp(EXP_BASE * normalized) - 1.0) / (exp(EXP_BASE) - 1.0);
  } else {
    float lr = (log(maxValue) - log(value)) / log(uLogBase);
    ratio = lr == 0.0 ? 1.0 : 1.0 / lr;
  }

  return ratio == 0.0 ? 0.0 : clamp(ratio, minRatio, 1.0);
}

float revenueAlpha(float value, float maxValue) {
  if (maxValue <= 0.0) return 0.0;
  return clamp(value / maxValue, MIN_ALPHA, MAX_ALPHA);
}

void main() {
  float x = instance.x;
  float rawWidthMs = instance.y;
  float value = instance.z;
  float row = instance.w;

  float width = max(rawWidthMs, uMinBarMs);
  float rowHeight = MAX_Y / uRows;
  float gap = uRows > 1.0 ? ROW_GAP_RATIO : 0.0;
  float usableHeight = rowHeight * (1.0 - gap);
  float height = usableHeight * revenueRatio(value, uMaxValue, MIN_HEIGHT_RATIO);

  float yPos = uRows > 1.0 ? (uRows - 1.0 - row) * rowHeight : ${"0.0"};

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

export function createTxnMesh(color: RgbColor): TxnMesh {
  const instanceArray = new Float32Array(INITIAL_CAPACITY * 4);
  const instanceAttr = new THREE.InstancedBufferAttribute(instanceArray, 4);
  instanceAttr.setUsage(THREE.DynamicDrawUsage);

  const quad = createUnitQuad();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.setAttribute("instance", instanceAttr);
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere();

  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMaxValue: { value: 0 },
      uMinBarMs: { value: 0 },
      uRows: { value: 1 },
      uScale: { value: SCALE_UNIFORM.linear },
      uLogBase: { value: revenueLogBase },
      uColor: { value: new THREE.Vector3(color[0], color[1], color[2]) },
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    geometry,
    material,
    instanceArray,
    instanceAttr,
    capacity: INITIAL_CAPACITY,
    count: 0,
    referenceX: undefined,
  };
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
  // @ts-expect-error accessing three.js private field
  txnMesh.geometry._maxInstanceCount = undefined;
}

export function setTxnInstance(
  txnMesh: TxnMesh,
  idx: number,
  x: number,
  rawWidthMs: number,
  value: number,
  row: number,
) {
  const i = idx * 4;
  txnMesh.instanceArray[i] = x;
  txnMesh.instanceArray[i + 1] = rawWidthMs;
  txnMesh.instanceArray[i + 2] = value;
  txnMesh.instanceArray[i + 3] = row;
}

export function updateTxnMeshCount(txnMesh: TxnMesh, count: number) {
  txnMesh.count = count;
  txnMesh.geometry.instanceCount = count;
  txnMesh.instanceAttr.needsUpdate = true;
}

export function disposeTxnMesh(txnMesh: TxnMesh) {
  txnMesh.geometry.dispose();
  txnMesh.material.dispose();
}
