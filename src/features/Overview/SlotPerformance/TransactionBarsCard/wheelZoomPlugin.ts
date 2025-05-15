import uPlot from "uplot";

export function wheelZoomPlugin(opts: {
  factor: number;
  uplotAction?: (action: (u: uPlot, id: string) => void) => void;
}): uPlot.Plugin {
  const factor = opts.factor || 0.75;

  let xMin: number | undefined,
    xMax: number | undefined,
    yMin: number | undefined,
    yMax: number | undefined,
    xRange: number,
    yRange: number;

  function clamp(
    nRange: number,
    nMin: number,
    nMax: number,
    fRange: number,
    fMin: number,
    fMax: number,
  ) {
    if (nRange > fRange) {
      nMin = fMin;
      nMax = fMax;
    } else if (nMin < fMin) {
      nMin = fMin;
      nMax = fMin + nRange;
    } else if (nMax > fMax) {
      nMax = fMax;
      nMin = fMax - nRange;
    }

    return [nMin, nMax];
  }

  return {
    hooks: {
      ready: (u) => {
        xMin = u.scales.x.min ?? 0;
        xMax = u.scales.x.max ?? 0;
        yMin = u.scales.y.min ?? 0;
        yMax = u.scales.y.max ?? 0;

        xRange = xMax - xMin;
        yRange = yMax - yMin;

        const over = u.over;
        const rect = over.getBoundingClientRect();

        // wheel drag pan
        // over.addEventListener("mousedown", (e) => {
        //   if (e.button == 1) {
        //     //	plot.style.cursor = "move";
        //     e.preventDefault();

        //     let left0 = e.clientX;
        //     //	let top0 = e.clientY;

        //     let scXMin0 = u.scales.x.min;
        //     let scXMax0 = u.scales.x.max;

        //     let xUnitsPerPx = u.posToVal(1, "x") - u.posToVal(0, "x");

        //     function onmove(e: { preventDefault: () => void; clientX: any }) {
        //       e.preventDefault();

        //       let left1 = e.clientX;
        //       //	let top1 = e.clientY;

        //       let dx = xUnitsPerPx * (left1 - left0);

        //       u.setScale("x", {
        //         min: scXMin0 ?? 0 - dx,
        //         max: scXMax0 ?? 0 - dx,
        //       });
        //     }

        //     function onup(e: any) {
        //       document.removeEventListener("mousemove", onmove);
        //       document.removeEventListener("mouseup", onup);
        //     }

        //     document.addEventListener("mousemove", onmove);
        //     document.addEventListener("mouseup", onup);
        //   }
        // });

        // wheel scroll zoom
        over.addEventListener("wheel", (e) => {
          if (!(e.ctrlKey || e.metaKey)) return;

          e.preventDefault();

          let { left, top } = u.cursor;
          left ??= 0;
          top ??= 0;

          const leftPct = left / rect.width;
          const btmPct = 1 - top / rect.height;
          const xVal = u.posToVal(left, "x");
          const yVal = u.posToVal(top, "y");
          const oxRange = (u.scales.x.max ?? 0) - (u.scales.x.min ?? 0);
          const oyRange = (u.scales.y.max ?? 0) - (u.scales.y.min ?? 0);

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

          if (opts.uplotAction) {
            requestAnimationFrame(() => {
              opts.uplotAction?.((u) =>
                u.setScale("x", {
                  min: nxMin,
                  max: nxMax,
                }),
              );
            });
          } else {
            u.batch(() => {
              u.setScale("x", {
                min: nxMin,
                max: nxMax,
              });
              // u.setScale("y", {
              //   min: nyMin,
              //   max: nyMax,
              // });
            });
          }
        });
      },
    },
  };
}
