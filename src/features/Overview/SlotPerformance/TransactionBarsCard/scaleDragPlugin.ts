import uPlot from "uplot";

export function timeScaleDragPlugin(): uPlot.Plugin {
  return {
    hooks: {
      init: [
        (u) => {
          const axisEls = u.root.querySelectorAll(".u-axis");

          // x axis
          const el = axisEls[0];
          if (!el) return;

          el.addEventListener("mousedown", (e) => {
            const x0 = (e as MouseEvent).clientX;
            const scaleKey = u.axes[0].scale;
            if (scaleKey === undefined) return;

            const scale = u.scales[scaleKey];
            const { min, max } = scale;
            const unitsPerPx =
              ((max ?? 0) - (min ?? 0)) / (u.bbox.width / uPlot.pxRatio);

            const mousemove = (e: MouseEvent) => {
              const dx = e.clientX - x0;
              const shiftXBy = dx * unitsPerPx;

              if (!u.data[0].length) return;

              const scaleMin = u.data[0][0] ?? 0;
              const scaleMax = u.data[0][u.data[0].length - 1] ?? 0;

              u.setScale(scaleKey, {
                min: Math.max(
                  scaleMin,
                  e.shiftKey ? (min ?? 0) - shiftXBy : (min ?? 0) + shiftXBy,
                ),
                max: Math.min(scaleMax, (max ?? 0) + shiftXBy),
              });
            };

            const mouseup = () => {
              document.removeEventListener("mousemove", mousemove);
              document.removeEventListener("mousemove", mouseup);
            };

            document.addEventListener("mousemove", mousemove);
            document.addEventListener("mouseup", mouseup);
          });
        },
      ],
    },
  };
}
