import * as THREE from "three";

/** Columns each pass folds into one */
const REDUCE = 16;

const vertexShader = /* glsl */ `
in vec2 position; // unit quad in [-0.5, 0.5]

void main() {
  gl_Position = vec4(position * 2.0, 0.0, 1.0);
}
`;

/**
 * Folds REDUCE columns of each row into their per channel max.
 * The first pass reads the coverage targets at each row's bar, and takes each
 * state's share of the px's busy time. Later passes fold the maxes.
 */
const createFragmentShader = (targetCount: number, isFirstPass: boolean) => {
  const indices = Array.from({ length: targetCount }, (_, i) => i);
  const sum = indices.map((i) => `dot(c${i}, vec4(1.0))`).join(" + ");
  return /* glsl */ `
precision highp float;

${indices.map((i) => `uniform sampler2D uInput${i};`).join("\n")}
uniform float uInputWidth; // px
uniform float uRowCount;
uniform float uBarFrac;    // bar height / row height
uniform float uMinStateWeight;

${indices.map((i) => `layout(location = ${i}) out vec4 outMax${i};`).join("\n")}

void main() {
  float row = floor(gl_FragCoord.y);
  // the first pass reads the middle of each row's bar, rows bottom-up
  float v = ${isFirstPass ? "(row + uBarFrac * 0.5)" : "(row + 0.5)"} / uRowCount;
${indices.map((i) => `  vec4 m${i} = vec4(0.0);`).join("\n")}
  for (int k = 0; k < ${REDUCE}; k++) {
    float x = floor(gl_FragCoord.x) * ${REDUCE}.0 + float(k) + 0.5;
    if (x >= uInputWidth) break;
    vec2 uv = vec2(x / uInputWidth, v);
${indices.map((i) => `    vec4 c${i} = texture(uInput${i}, uv);`).join("\n")}
${
  isFirstPass
    ? `${indices
        .map(
          (i) =>
            `    c${i} = mix(c${i}, max(c${i}, vec4(uMinStateWeight)), step(1e-9, c${i}));`,
        )
        .join("\n")}
    float busy = ${sum};
    if (busy > 0.0) {
${indices.map((i) => `      m${i} = max(m${i}, c${i} / busy);`).join("\n")}
    }`
    : indices.map((i) => `    m${i} = max(m${i}, c${i});`).join("\n")
}
  }
${indices.map((i) => `  outMax${i} = m${i};`).join("\n")}
}
`;
};

export interface LaneMaxReducer {
  /** 1px wide with a px per row, holding each channel's max share in view */
  target: THREE.WebGLRenderTarget;
  reduce: (
    renderer: THREE.WebGLRenderer,
    rowCount: number,
    barFrac: number,
    minStateWeight: number,
  ) => void;
  dispose: () => void;
}

/** Reduces the coverage targets to each state's max share of a px per row */
export function createLaneMaxReducer(
  coverageTarget: THREE.WebGLRenderTarget,
  unitQuad: THREE.BufferGeometry,
  type: THREE.TextureDataType,
): LaneMaxReducer {
  const count = coverageTarget.textures.length;
  const createTarget = () =>
    new THREE.WebGLRenderTarget(1, 1, {
      count,
      type,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
  const target = createTarget();
  const intermediates: THREE.WebGLRenderTarget[] = [];

  const createMaterial = (isFirstPass: boolean) =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader: createFragmentShader(count, isFirstPass),
      depthTest: false,
      blending: THREE.NoBlending,
      uniforms: {
        ...Object.fromEntries(
          Array.from({ length: count }, (_, i) => [
            `uInput${i}`,
            { value: null },
          ]),
        ),
        uInputWidth: { value: 1 },
        uRowCount: { value: 1 },
        uBarFrac: { value: 1 },
        uMinStateWeight: { value: 0 },
      },
    });
  const firstPassMaterial = createMaterial(true);
  const reduceMaterial = createMaterial(false);

  const mesh = new THREE.Mesh(unitQuad, firstPassMaterial);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();

  const reduce: LaneMaxReducer["reduce"] = (
    renderer,
    rowCount,
    barFrac,
    minStateWeight,
  ) => {
    let input = coverageTarget;
    let inputWidth = coverageTarget.width;
    for (let level = 0; inputWidth > 1 || level === 0; level++) {
      const width = Math.ceil(inputWidth / REDUCE);
      const output =
        width === 1 ? target : (intermediates[level] ??= createTarget());
      output.setSize(width, rowCount);

      const material = level === 0 ? firstPassMaterial : reduceMaterial;
      input.textures.forEach((texture, i) => {
        material.uniforms[`uInput${i}`].value = texture;
      });
      material.uniforms.uInputWidth.value = inputWidth;
      material.uniforms.uRowCount.value = rowCount;
      material.uniforms.uBarFrac.value = barFrac;
      material.uniforms.uMinStateWeight.value = minStateWeight;
      mesh.material = material;

      renderer.setRenderTarget(output);
      renderer.render(scene, camera);
      input = output;
      inputWidth = width;
    }
  };

  const dispose = () => {
    target.dispose();
    for (const intermediate of intermediates) intermediate.dispose();
    firstPassMaterial.dispose();
    reduceMaterial.dispose();
  };

  return { target, reduce, dispose };
}
