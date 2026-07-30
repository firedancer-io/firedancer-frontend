/**
 * Detect whether a WebGL2 context can be created. Three.js (>= r163) is
 * WebGL2-only, and `new WebGLRenderer()` throws if the context can't be
 * created. Some browsers / GPUs report support but still fail, so probe
 * a canvas.
 */
export function isWebGl2Available(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!canvas.getContext("webgl2");
  } catch {
    return false;
  }
}
