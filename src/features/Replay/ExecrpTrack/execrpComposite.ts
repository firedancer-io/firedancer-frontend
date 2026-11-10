import * as THREE from "three";
import { convertToWebGlColor } from "../../WebGl/webglUtils.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import { ErrorState, errorStateColors } from "../tileStates/consts.ts";
import {
  BACKGROUND_LINEAR,
  createCompositeFragmentShader,
  createCompositePass,
  getLinearColors,
  type CompositeContext,
} from "../tileStates/composite.ts";
import {
  createErrorStatesMaterial,
  ensureStatesCapacity,
  setErrorStatesSize,
  type StatesMesh,
} from "../tileStates/tileStatesMesh.ts";
import type { TileStateColumns } from "../tileStates/tileStatesCache.ts";
import {
  addRectToMesh,
  getRectSlot,
  type RowOfTile,
  type TileStatesComposite,
} from "../tileStates/utils.ts";
import type { SlotHighlight } from "../slotHighlight.ts";

export type ExecrpMode = "heatmap" | "stacked";

export interface ExecrpViewOpts {
  mode: ExecrpMode;
  showErrorStates: boolean;
  idleWeight: number;
}

const idleWeightGlsl = /* glsl */ `
  uniform float uIdleWeight; // idle time's weight against the busy states
`;

/**
 * Busy state colors mixed by time in linear light over the background
 */
const createHeatmapFragmentShader = (stateCount: number) =>
  createCompositeFragmentShader(
    stateCount,
    /* glsl */ `
      ${idleWeightGlsl}
      uniform vec3 uBackgroundLinear;
      uniform vec3 uStateLinearColors[${stateCount}];

      vec3 linearToSrgb(vec3 c) {
        return mix(
          c * 12.92,
          1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
          step(0.0031308, c)
        );
      }
    `,
    /* glsl */ `
      vec3 busyColor = vec3(0.0);
      for (int i = 0; i < ${stateCount}; i++) {
        busyColor += uStateLinearColors[i] * coverage[i];
      }
      // time without a busy state is idle, shown as weighted background
      float idleWeight = uIdleWeight * max(1.0 - busy, 0.0);
      float total = busy + idleWeight;
      if (total > 0.0) {
        color = linearToSrgb((busyColor + uBackgroundLinear * idleWeight) / total);
      }
    `,
  );

/**
 * States stacked by their share of the bar, the first on top
 */
const createStackedFragmentShader = (stateCount: number) =>
  createCompositeFragmentShader(
    stateCount,
    idleWeightGlsl,
    /* glsl */ `
      float total = busy + uIdleWeight * max(1.0 - busy, 0.0);
      float top = 0.0;
      for (int i = ${stateCount} - 1; i >= 0 && total > 0.0; i--) {
        top += coverage[i] / total;
        if (barY < top) {
          color = uStateColors[i];
          break;
        }
      }
    `,
  );

const ERROR_STATE_PALETTE = Object.values(errorStateColors).map(
  (color) => new THREE.Vector3(...convertToWebGlColor(color)),
);

/** Error states outline txns, over the heatmap's single color */
export function canShowErrorStates(
  granularity: TileStatesGranularity | undefined,
  mode: ExecrpMode,
) {
  return granularity === TileStatesGranularityEnum.txn && mode === "heatmap";
}

/** Top/bottom borders per txn with an error code */
function appendErrorStates(
  highlight: SlotHighlight,
  mesh: StatesMesh,
  data: TileStateColumns,
  start: number,
  rowOfTile: RowOfTile,
): number {
  if (rowOfTile.size === 0) return start;

  let needed = 0;
  for (let i = 0; i < data.txn_idx.length; i++) {
    if (rowOfTile.has(data.txn_tile[i]) && data.txn_error_code[i] !== null)
      needed++;
  }
  ensureStatesCapacity(mesh, start + needed);

  let count = start;
  for (let i = 0; i < data.txn_idx.length; i++) {
    const row = rowOfTile.get(data.txn_tile[i]);
    const errorCode = data.txn_error_code[i];
    if (row === undefined || errorCode === null) continue;
    addRectToMesh(
      mesh,
      count++,
      data.txn_start_ms[i],
      data.txn_end_ms[i],
      row,
      errorCode ? ErrorState.Failed : ErrorState.Succeeded,
      1,
      getRectSlot(highlight, data.txn_slot[i]),
    );
  }
  return count;
}

/**
 * Heatmap or stacked states, with error states drawn over txn heatmaps.
 * Reads the opts on each render.
 */
export function createExecrpComposite(
  ctx: CompositeContext,
  getOpts: () => ExecrpViewOpts,
): TileStatesComposite {
  const { renderer } = ctx;
  const pass = createCompositePass(
    ctx,
    {
      heatmap: createHeatmapFragmentShader,
      stacked: createStackedFragmentShader,
    },
    {
      uIdleWeight: { value: 0 },
      uBackgroundLinear: { value: new THREE.Vector3(...BACKGROUND_LINEAR) },
      uStateLinearColors: { value: getLinearColors(ctx.states) },
    },
  );

  const errorStatesMaterial = createErrorStatesMaterial(
    ERROR_STATE_PALETTE,
    ctx.highlight,
  );
  const errorStatesScene = new THREE.Scene();
  const camera = new THREE.Camera();

  return {
    overlay: {
      material: errorStatesMaterial,
      scene: errorStatesScene,
      append: (mesh, data, start, rowOfTile) =>
        appendErrorStates(ctx.highlight, mesh, data, start, rowOfTile),
    },
    setStates: (states) => {
      pass.setStates(states);
      pass.uniforms.uStateLinearColors.value = getLinearColors(states);
    },
    resize: () =>
      setErrorStatesSize(
        errorStatesMaterial,
        renderer.getPixelRatio(),
        renderer.domElement.height,
      ),
    render: ({ renderedGranularity }, rowCount) => {
      const { mode, idleWeight, showErrorStates } = getOpts();
      pass.uniforms.uIdleWeight.value = idleWeight;
      pass.render(mode, rowCount);
      if (showErrorStates && canShowErrorStates(renderedGranularity, mode)) {
        renderer.render(errorStatesScene, camera);
      }
    },
    dispose: () => {
      pass.dispose();
      errorStatesMaterial.dispose();
    },
  };
}
