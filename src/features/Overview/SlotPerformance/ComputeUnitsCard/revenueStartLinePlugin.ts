import uPlot from "uplot";

import { xScaleKey } from "./consts";
import { revenueStartLineColor } from "../../../../colors";
import { round } from "lodash";

const revenueLineNs = 350_000_000;
const textPadding = 2;

let font = "bold 12px Inter Tight";

function recalcDppxVars() {
  font = `bold ${round(12 * uPlot.pxRatio)}px Inter Tight`;
}

export function revenueStartLinePlugin(): uPlot.Plugin {
  return {
    hooks: {
      init: () => {
        window.addEventListener("dppxchange", recalcDppxVars);
      },
      destroy: () => {
        window.removeEventListener("dppxchange", recalcDppxVars);
      },
      drawSeries: [
        (u, sid) => {
          // to draw the ref area above bank lines, but below other series
          if (u.series[sid].label !== "Active Bank") return;

          const ctx = u.ctx;

          ctx.save();

          const xScale = u.scales[xScaleKey];
          const x = Math.round(u.valToPos(revenueLineNs, xScaleKey, true));

          // ignore if outside bounds
          if (
            (xScale.min !== undefined && revenueLineNs < xScale.min) ||
            (xScale.max !== undefined && revenueLineNs > xScale.max)
          ) {
            return;
          }

          recalcDppxVars();
          ctx.font = font;

          ctx.beginPath();

          ctx.fillStyle = revenueStartLineColor;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";

          ctx.fillText("Start", x, u.bbox.top - textPadding * uPlot.pxRatio);

          ctx.strokeStyle = revenueStartLineColor;
          ctx.lineWidth = 5 / uPlot.pxRatio;
          ctx.setLineDash([5, 5]);

          ctx.moveTo(x, u.bbox.top);
          ctx.lineTo(x, u.bbox.top + u.bbox.height);
          ctx.stroke();

          ctx.restore();
        },
      ],
    },
  };
}
