// derived from https://github.com/leeoniya/uPlot/blob/master/demos/zoom-touch.html

import uPlot from "uplot";
import { xScaleKey } from "../features/Overview/SlotPerformance/ComputeUnitsCard/consts";
import { clamp } from "./utils";

interface Position {
  x: number;
  y: number;
  dx: number;
  dy: number;
  d: number;
}

function storePos(event: TouchEvent, pos: Position, rect: DOMRect) {
  const t0 = event.touches[0];
  const t0x = t0.clientX - rect.left;
  const t0y = t0.clientY - rect.top;

  if (event.touches.length == 1) {
    pos.x = t0x;
    pos.y = t0y;
    pos.d = pos.dx = pos.dy = 1;
  } else {
    const t1 = event.touches[1];
    const t1x = t1.clientX - rect.left;
    const t1y = t1.clientY - rect.top;

    const xMin = Math.min(t0x, t1x);
    const yMin = Math.min(t0y, t1y);
    const xMax = Math.max(t0x, t1x);
    const yMax = Math.max(t0y, t1y);

    // midpts
    pos.y = (yMin + yMax) / 2;
    pos.x = (xMin + xMax) / 2;

    pos.dx = xMax - xMin;
    pos.dy = yMax - yMin;

    // dist
    pos.d = Math.sqrt(pos.dx * pos.dx + pos.dy * pos.dy);
  }
}

export function touchPlugin(): uPlot.Plugin {
  let rect: DOMRect;
  let oxRange: number;
  let fxRange: number;
  let xMin: number;
  let xMax: number;
  let xVal: number;
  const fromPos: Position = { x: 0, y: 0, dx: 0, dy: 0, d: 0 };
  const toPos: Position = { x: 0, y: 0, dx: 0, dy: 0, d: 0 };
  let rafPending = false;

  return {
    hooks: {
      ready: (u) => {
        xMin = u.scales.x.min ?? 0;
        xMax = u.scales.x.max ?? 0;
        fxRange = xMax - xMin;

        function zoom() {
          // non-uniform scaling
          const xFactor = fromPos.dx / toPos.dx;
          // uniform scaling
          // const xFactor = fromPos.d / toPos.d;
          const leftPct = toPos.x / rect.width;

          const nxRange = oxRange * xFactor;
          let nxMin = xVal - leftPct * nxRange;
          let nxMax = nxMin + nxRange;

          [nxMin, nxMax] = clamp(nxRange, nxMin, nxMax, fxRange, xMin, xMax);

          u.batch(() => {
            u.setScale(xScaleKey, {
              min: nxMin,
              max: nxMax,
            });
          });

          rafPending = false;
        }

        function touchmove(e: TouchEvent) {
          storePos(e, toPos, rect);

          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(zoom);
          }
        }

        u.over.addEventListener("touchstart", function (e) {
          if (
            u.scales[xScaleKey].max === undefined ||
            u.scales[xScaleKey].min === undefined
          )
            return;

          rect = u.over.getBoundingClientRect();
          oxRange = u.scales[xScaleKey].max - u.scales[xScaleKey].min;
          xVal = u.posToVal(fromPos.x, xScaleKey);

          storePos(e, fromPos, rect);

          document.addEventListener("touchmove", touchmove, { passive: true });
        });

        u.over.addEventListener("touchend", function (e) {
          document.removeEventListener("touchmove", touchmove);
        });
      },
    },
  };
}
