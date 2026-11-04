import * as THREE from "three";
import {
  createUnitQuad,
  disposeRectResources,
  fragmentShader,
  glslFloat,
  type RectMesh,
  type RectResources,
} from "../../WebGl/webglUtils";
import type { NonAggRendererResources } from "./const";

// Device-pixel width of the mark
const EDGE_PX = 1;

// Snaps the left edge to a whole device pixel so the mark keeps a constant
// width and brightness as the camera pans. instanceRect.z (world width) is
// ignored; the width is a fixed device-pixel count.
const edgeVertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uViewWidthPx;
const float uEdgePx = ${glslFloat(EDGE_PX)};

attribute vec2 position;
attribute vec4 instanceRect;  // x, y, w(unused), h in world space
attribute vec3 instanceColor;

varying vec3 vColor;

float toPx(float clipX) {
  return (clipX + 1.0) * 0.5 * uViewWidthPx;
}

void main() {
  mat4 mvp = projectionMatrix * modelViewMatrix;
  float yWorld = instanceRect.y + (position.y + 0.5) * instanceRect.w;
  vec4 clip = mvp * vec4(instanceRect.x, yWorld, 0.0, 1.0);

  float leftPx = floor(toPx(clip.x) + 0.5);
  float rightPx = leftPx + uEdgePx;
  clip.x = (position.x < 0.0 ? leftPx : rightPx) / uViewWidthPx * 2.0 - 1.0;

  gl_Position = clip;
  vColor = instanceColor;
}
`;

function createEdgeMaterial() {
  return new THREE.RawShaderMaterial({
    vertexShader: edgeVertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uOpacity: { value: 1 },
      uViewWidthPx: { value: 1 },
    },
  });
}

function createEdgeResources(): RectResources {
  return {
    unitQuad: createUnitQuad(),
    rectMaterial: createEdgeMaterial(),
  };
}

export function updateEdgeViewWidth(
  material: THREE.RawShaderMaterial,
  viewWidthPx: number,
) {
  material.uniforms.uViewWidthPx.value = viewWidthPx;
}

export function setUpEdgeResources() {
  return {
    edgeResources: createEdgeResources(),
    edgeMeshes: new Map<string, RectMesh>(),
    availableEdgeMeshes: [],
  };
}

export function cleanUpEdgeResources(
  {
    edgeResources,
    edgeMeshes,
    availableEdgeMeshes,
  }: Pick<
    NonAggRendererResources,
    "edgeResources" | "edgeMeshes" | "availableEdgeMeshes"
  >,
  wasContextLost: boolean,
) {
  if (wasContextLost) return;
  for (const edgeMesh of edgeMeshes.values()) {
    edgeMesh.mesh.geometry.dispose();
  }
  for (const edgeMesh of availableEdgeMeshes) {
    edgeMesh.mesh.geometry.dispose();
  }
  disposeRectResources(edgeResources);
}
