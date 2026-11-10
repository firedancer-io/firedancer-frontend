import * as THREE from "three";
import { convertToWebGlColor, type RgbColor } from "../../WebGl/webglUtils.ts";
import type { TileState } from "../../../api/entities.ts";
import { replayTrackBackgroundColor } from "../../../colors.ts";
import { BAR_HEIGHT_RATIO, tileStateColors } from "./consts.ts";
import { slotHighlightGlsl, type SlotHighlight } from "../slotHighlight.ts";

const tmpColor = new THREE.Color();

/**
 * sRGB to linear light.
 * sRGB is gamma-encoded, so a state split over 2 px shows less light than whole.
 * Linear light lets tile state colors be time-weighted and summed accurately.
 */
function toLinear([r, g, b]: RgbColor): RgbColor {
  tmpColor.setRGB(r, g, b, THREE.SRGBColorSpace);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
}

const BACKGROUND_SRGB = convertToWebGlColor(replayTrackBackgroundColor);
export const BACKGROUND_LINEAR = toLinear(BACKGROUND_SRGB);

const RGB_HEX_LENGTH = 7;
const RGBA_HEX_LENGTH = 9;
const HEX_RADIX = 16;
const MAX_ALPHA_BYTE = 255;

function convertToOpaqueWebGlColor(hex: string): RgbColor {
  const rgb = convertToWebGlColor(hex.slice(0, RGB_HEX_LENGTH));
  const alpha =
    hex.length === RGBA_HEX_LENGTH
      ? parseInt(hex.slice(RGB_HEX_LENGTH), HEX_RADIX) / MAX_ALPHA_BYTE
      : 1;
  return [
    rgb[0] * alpha + BACKGROUND_SRGB[0] * (1 - alpha),
    rgb[1] * alpha + BACKGROUND_SRGB[1] * (1 - alpha),
    rgb[2] * alpha + BACKGROUND_SRGB[2] * (1 - alpha),
  ];
}

/** sRGB, indexed by TileState */
const TILE_STATE_SRGB_PALETTE = Object.values(tileStateColors).map(
  convertToOpaqueWebGlColor,
);

const SRGB_PALETTE = TILE_STATE_SRGB_PALETTE.map(
  (color) => new THREE.Vector3(...color),
);

/** Linear light, indexed by TileState */
export const TILE_STATE_PALETTE = TILE_STATE_SRGB_PALETTE.map(
  (color) => new THREE.Vector3(...toLinear(color)),
);

export function getLinearColors(states: TileState[]) {
  return states.map((state) => TILE_STATE_PALETTE[state]);
}

function getSrgbColors(states: TileState[]) {
  return states.map((state) => SRGB_PALETTE[state]);
}

const fullscreenVertexShader = /* glsl */ `
  in vec2 position; // unit quad in [-0.5, 0.5]

  void main() {
    gl_Position = vec4(position * 2.0, 0.0, 1.0);
  }
`;

/**
 * Highlights a px by the slot and group most of its busy time is in. Agg data
 * has no slots, so it highlights by time instead.
 */
const spotlightGlsl = /* glsl */ `
  ${slotHighlightGlsl}
  // a texel per row: time in the focus slot, its group, the hovered other slot,
  // and its group
  uniform sampler2D uSlotCoverage;
  uniform float uHasSlotCoverage;

  vec3 spotlight(vec3 color, int x, int row, float busy) {
    vec3 result;
    if (uHasSlotCoverage > 0.5) {
      vec4 share = texelFetch(uSlotCoverage, ivec2(x, row), 0) / busy;
      result = applyHighlight(
        color,
        share.x > 0.5,
        share.y > 0.5,
        share.z > 0.5,
        share.w > 0.5
      );
    } else {
      result = highlightTime(color, gl_FragCoord.x);
    }
    return result;
  }
`;

/**
 * Shades each px's row bar from its per state time coverage.
 */
export const createCompositeFragmentShader = (
  stateCount: number,
  declarations: string,
  shade: string,
) => /* glsl */ `
  precision highp float;

  uniform sampler2D uCoverage;  // a texel row per row and state, rows bottom-up
  uniform vec2 uCanvasSize;     // px in canvas dimensions
  uniform float uRowCount;
  uniform float uBarRatio;      // bar height / row height
  uniform vec3 uBackground;     // srgb
  uniform vec3 uStateColors[${stateCount}]; // srgb
  ${spotlightGlsl}
  ${declarations}

  out vec4 fragColor;

  void main() {
    vec2 uv = gl_FragCoord.xy / uCanvasSize;
    float rowH = 1.0 / uRowCount;
    // bars sit at the bottom of their rows
    float barY = mod(uv.y, rowH) / (rowH * uBarRatio);
    vec3 color = uBackground;
    if (barY < 1.0) {
      int row = int(uv.y / rowH);
      int firstTexelRow = row * ${stateCount};
      int x = int(gl_FragCoord.x);
      float coverage[${stateCount}];
      float busy = 0.0;
      for (int i = 0; i < ${stateCount}; i++) {
        coverage[i] = texelFetch(uCoverage, ivec2(x, firstTexelRow + i), 0).r;
        busy += coverage[i];
      }
      ${shade}
      // only what's drawn, not the bar's background
      if (busy > 0.0 && color != uBackground) {
        color = spotlight(color, x, row, busy);
      }
    }
    fragColor = vec4(color, 1.0);
  }
`;

export interface CompositeContext {
  renderer: THREE.WebGLRenderer;
  /** Each px's time per row and state */
  coverageTarget: THREE.WebGLRenderTarget;
  unitQuad: THREE.BufferGeometry;
  /** The coverage states, which set the shaders' state count */
  states: TileState[];
  highlight: SlotHighlight;
  /** Each px's time per row in the highlighted slots and groups */
  slotCoverageTarget: THREE.WebGLRenderTarget;
  /** Whether the slot coverage is drawn, else it highlights by time */
  hasSlotCoverage: THREE.IUniform<number>;
}

/** Shades the canvas from the coverage target, with a material per mode */
export function createCompositePass<
  TMode extends string,
  TUniforms extends Record<string, THREE.IUniform>,
>(
  {
    renderer,
    coverageTarget,
    unitQuad,
    states,
    highlight,
    slotCoverageTarget,
    hasSlotCoverage,
  }: CompositeContext,
  fragmentShaders: Record<TMode, (stateCount: number) => string>,
  modeUniforms: TUniforms,
) {
  const uniforms = {
    uCoverage: { value: coverageTarget.texture },
    uCanvasSize: { value: new THREE.Vector2(1, 1) },
    uRowCount: { value: 1 },
    uBarRatio: { value: BAR_HEIGHT_RATIO },
    uBackground: { value: new THREE.Vector3(...BACKGROUND_SRGB) },
    uStateColors: { value: getSrgbColors(states) },
    ...highlight.uniforms,
    uSlotCoverage: { value: slotCoverageTarget.texture },
    uHasSlotCoverage: hasSlotCoverage,
    ...modeUniforms,
  };

  const modes = Object.keys(fragmentShaders) as TMode[];
  const materials = new Map(
    modes.map((mode) => [
      mode,
      new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: fullscreenVertexShader,
        fragmentShader: fragmentShaders[mode](states.length),
        depthTest: false,
        uniforms,
      }),
    ]),
  );

  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>(
    unitQuad,
  );
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();
  for (const material of materials.values()) {
    mesh.material = material;
    renderer.compile(scene, camera);
  }

  return {
    uniforms,
    setStates: (states: TileState[]) => {
      uniforms.uStateColors.value = getSrgbColors(states);
    },
    render: (mode: TMode, rowCount: number) => {
      const { width, height } = renderer.domElement;
      uniforms.uCanvasSize.value.set(width, height);
      uniforms.uRowCount.value = rowCount;
      const material = materials.get(mode);
      if (!material) return;
      mesh.material = material;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose: () => {
      for (const material of materials.values()) material.dispose();
    },
  };
}
