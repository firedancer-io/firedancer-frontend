import * as THREE from "three";
import {
  createUnitQuad,
  disposeRectResources,
  fragmentShader,
  glslFloat,
  type RectMesh,
  type RectResources,
} from "../../WebGl/webglUtils";

// Device-pixel width of the mark
const EDGE_PX = 1;

// Marks appear above their own slot's events, but below bigger slot numbers' events
export const EDGE_RENDER_ORDER_OFFSET = 0.5;

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

export function createEdgeMaterial(
  edgeFragmentShader = fragmentShader,
  uniforms: Record<string, THREE.IUniform> = {},
) {
  return new THREE.RawShaderMaterial({
    vertexShader: edgeVertexShader,
    fragmentShader: edgeFragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uOpacity: { value: 1 },
      uViewWidthPx: { value: 1 },
      ...uniforms,
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

export interface EdgeResourceBundle<MeshKey extends string | number> {
  edgeResources: RectResources;
  edgeMeshes: Map<MeshKey, RectMesh>;
  availableEdgeMeshes: RectMesh[];
}

export function setUpEdgeResources<
  MeshKey extends string | number,
>(): EdgeResourceBundle<MeshKey> {
  return {
    edgeResources: createEdgeResources(),
    edgeMeshes: new Map<MeshKey, RectMesh>(),
    availableEdgeMeshes: [],
  };
}

export function cleanUpEdgeResources<MeshKey extends string | number>(
  {
    edgeResources,
    edgeMeshes,
    availableEdgeMeshes,
  }: EdgeResourceBundle<MeshKey>,
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
