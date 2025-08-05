import uPlot from "uplot";

import { xScaleKey } from "./consts";
import { startLineColor } from "../../../../colors";
import { getDefaultStore } from "jotai";
import { ScheduleStrategyEnum } from "../../../../api/entities";
import { scheduleStrategyAtom } from "../../../../api/atoms";
import { iconSize, infoIconId } from "./CuChartInfoIcon";
import placement from "../../../../uplot/placement";
import { showChartBackgroundAtom } from "./atoms";

const store = getDefaultStore();

const lineNs = 350_000_000;

let iconEl: HTMLElement;

export function startLinePlugin(): uPlot.Plugin {
  const scheduleStrategy = store.get(scheduleStrategyAtom);
  if (scheduleStrategy !== ScheduleStrategyEnum.revenue) return { hooks: {} };

  return {
    hooks: {
      init: (u) => {
        const el = document.getElementById(infoIconId);
        if (!el) return;

        iconEl = el;
      },
      drawSeries: [
        (u, sid) => {
          // to draw the line above bank lines, but below other series
          if (u.series[sid].label !== "Active Bank") return;

          iconEl.style.display = "none";

          if (!store.get(showChartBackgroundAtom)) return;

          const xScale = u.scales[xScaleKey];
          const x = Math.round(u.valToPos(lineNs, xScaleKey, true));

          // no line if out of bounds
          if (
            (xScale.min !== undefined && lineNs < xScale.min) ||
            (xScale.max !== undefined && lineNs > xScale.max)
          ) {
            return;
          }

          const ctx = u.ctx;

          ctx.save();

          ctx.beginPath();

          ctx.strokeStyle = startLineColor;
          ctx.lineWidth = 5 / uPlot.pxRatio;
          ctx.setLineDash([5, 5]);

          ctx.moveTo(x, u.bbox.top);
          ctx.lineTo(x, u.bbox.top + u.bbox.height);
          ctx.stroke();

          ctx.restore();

          if (iconEl) {
            const infoIconX = Math.round(u.valToPos(lineNs, xScaleKey, false));

            const bbox = u.over.getBoundingClientRect();
            const anchor = {
              left: infoIconX + bbox.left - iconSize / 2,
              top: bbox.top - 18,
            };

            placement(iconEl, anchor, "center", "bottom", {
              bound: document.body,
            });

            iconEl.style.display = "block";
          }
        },
      ],
    },
  };
}
