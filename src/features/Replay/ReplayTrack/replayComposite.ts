import { BAR_HEIGHT_RATIO } from "../tileStates/consts.ts";
import {
  createCompositeFragmentShader,
  createCompositePass,
  type CompositeContext,
} from "../tileStates/composite.ts";
import type { TileStatesComposite } from "../tileStates/utils.ts";

/** Max gap between state lanes */
const LANE_GAP_PX = 2;

/** Gap above every lane but the first, in the bar height's px */
export function getLaneGapPx(barHeightPx: number, laneCount: number) {
  return Math.min(LANE_GAP_PX, barHeightPx / laneCount / 4);
}

/**
 * Up to this span, lanes fill wherever their state has any time. Past it, they
 * scale to their state's share of busy time.
 */
const GANTT_MAX_MS = 10_000;

/** A lane per state, top-down */
const createLanesGlsl = (laneCount: number) => /* glsl */ `
  uniform float uLaneGapFrac; // gap above every lane but the first / lane height

  /**
   * Sets the lane at barY, top-down. Returns the height from the lane's bottom
   * over its drawn height, or -1 in the gap above every lane but the first.
   */
  float laneHeightAt(float barY, out int lane) {
    float lanePos = (1.0 - barY) * ${laneCount}.0;
    float laneIdx = min(floor(lanePos), ${laneCount - 1}.0);
    lane = int(laneIdx);
    float gapFrac = laneIdx > 0.0 ? uLaneGapFrac : 0.0;
    float fromTop = lanePos - laneIdx;
    if (fromTop < gapFrac) return -1.0;
    return (1.0 - fromTop) / (1.0 - gapFrac);
  }
`;

/**
 * Lanes filled wherever their state has any time
 */
const createGanttFragmentShader = (stateCount: number) =>
  createCompositeFragmentShader(
    stateCount,
    createLanesGlsl(stateCount),
    /* glsl */ `
      int lane;
      float laneY = laneHeightAt(barY, lane);
      if (laneY >= 0.0 && coverage[lane] > 0.0) {
        color = uStateColors[lane];
      }
    `,
  );

/**
 * Lanes scaled together, so the largest share of busy time any state has in
 * view fills a lane
 */
const createStackedLanesFragmentShader = (stateCount: number) =>
  createCompositeFragmentShader(
    stateCount,
    createLanesGlsl(stateCount) +
      /* glsl */ `
        uniform float uLaneMax; // the largest share of busy time in view
      `,
    /* glsl */ `
      int lane;
      float laneY = laneHeightAt(barY, lane);
      if (laneY >= 0.0 && busy > 0.0) {
        if (uLaneMax > 0.0 && laneY < coverage[lane] / busy / uLaneMax) {
          color = uStateColors[lane];
        }
      }
    `,
  );

/** A lane per state, as a gantt when zoomed in and scaled stacks past it */
export function createReplayComposite(
  ctx: CompositeContext,
): TileStatesComposite {
  const { renderer } = ctx;
  const laneCount = ctx.states.length;
  const pass = createCompositePass(
    ctx,
    {
      gantt: createGanttFragmentShader,
      stackedLanes: createStackedLanesFragmentShader,
    },
    {
      uLaneMax: { value: 1 },
      uLaneGapFrac: { value: 0 },
    },
  );

  return {
    setStates: pass.setStates,
    render: ({ msPerPx, aggMaxStateShare }, rowCount, isAgg) => {
      const { width, height } = renderer.domElement;
      const pixelRatio = renderer.getPixelRatio();
      const lanePx = ((height / rowCount) * BAR_HEIGHT_RATIO) / laneCount;
      pass.uniforms.uLaneGapFrac.value =
        lanePx > 0
          ? (getLaneGapPx((lanePx * laneCount) / pixelRatio, laneCount) *
              pixelRatio) /
            lanePx
          : 0;

      if (msPerPx * width <= GANTT_MAX_MS) {
        pass.render("gantt", rowCount);
        return;
      }
      pass.uniforms.uLaneMax.value = isAgg ? aggMaxStateShare : 1;
      pass.render("stackedLanes", rowCount);
    },
    dispose: pass.dispose,
  };
}
