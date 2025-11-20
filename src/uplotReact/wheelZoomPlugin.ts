import type uPlot from "uplot";
import { banksXScaleKey } from "../features/Overview/SlotPerformance/ComputeUnitsCard/consts";
import { clamp } from "./utils";

export function wheelZoomPlugin(opts: { factor: number }): uPlot.Plugin {
  const factor = opts.factor || 0.75;
  const panFactor = 0.1;

  let xMin: number | undefined,
    xMax: number | undefined,
    yMin: number | undefined,
    yMax: number | undefined,
    xRange: number,
    yRange: number;

  let resizeObserver: ResizeObserver | undefined;

  return {
    hooks: {
      ready(u) {
        const xScaleKey = u.series[0].scale ?? "x";
        const yScaleKey =
          u.series.find((s, i) => i > 0 && s.show !== false)?.scale ?? "y";

        xMin = u.scales[xScaleKey].min ?? 0;
        xMax = u.scales[xScaleKey].max ?? 0;
        yMin = u.scales[yScaleKey].min ?? 0;
        yMax = u.scales[yScaleKey].max ?? 0;

        xRange = xMax - xMin;
        yRange = yMax - yMin;

        const over = u.over;
        let rect = over.getBoundingClientRect();

        // So that the onWheel calcs with the most recent rect size after window resizing
        resizeObserver = new ResizeObserver(() => {
          rect = over.getBoundingClientRect();
        });
        resizeObserver.observe(over);

        over.addEventListener("wheel", (e) => {
          if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;

          e.preventDefault();

          if (e.ctrlKey || e.metaKey) {
            let { left, top } = u.cursor;
            left ??= 0;
            top ??= 0;

            const leftPct = left / rect.width;
            const btmPct = 1 - top / rect.height;
            const xVal = u.posToVal(left, banksXScaleKey);
            const yVal = u.posToVal(top, "y");
            const oxRange =
              (u.scales[xScaleKey].max ?? 0) - (u.scales[xScaleKey].min ?? 0);
            const oyRange =
              (u.scales[yScaleKey].max ?? 0) - (u.scales[yScaleKey].min ?? 0);

            const nxRange = e.deltaY < 0 ? oxRange * factor : oxRange / factor;
            let nxMin = xVal - leftPct * nxRange;
            let nxMax = nxMin + nxRange;

            [nxMin, nxMax] = clamp(
              nxRange,
              nxMin,
              nxMax,
              xRange,
              xMin ?? 0,
              xMax ?? 0,
            );

            const nyRange = e.deltaY < 0 ? oyRange * factor : oyRange / factor;
            let nyMin = yVal - btmPct * nyRange;
            let nyMax = nyMin + nyRange;
            [nyMin, nyMax] = clamp(
              nyRange,
              nyMin,
              nyMax,
              yRange,
              yMin ?? 0,
              yMax ?? 0,
            );

            requestAnimationFrame(() =>
              u.batch(() => {
                u.setScale(banksXScaleKey, {
                  min: nxMin,
                  max: nxMax,
                });
                // u.setScale("y", {
                //   min: nyMin,
                //   max: nyMax,
                // });
              }),
            );
          } else if (e.shiftKey) {
            const nxRange =
              (u.scales[xScaleKey].max ?? 0) - (u.scales[xScaleKey].min ?? 0);
            let panDistance = nxRange * panFactor;
            if (e.deltaY >= 0) {
              panDistance *= -1;
            }

            const [min, max] = clamp(
              nxRange,
              (u.scales[xScaleKey].min ?? 0) + panDistance,
              (u.scales[xScaleKey].max ?? 0) + panDistance,
              nxRange,
              xMin ?? 0,
              xMax ?? 0,
            );

            requestAnimationFrame(() =>
              u.setScale(banksXScaleKey, {
                min,
                max,
              }),
            );
          }
        });
      },
      destroy(u) {
        resizeObserver?.disconnect();
      },
    },
  };
}
