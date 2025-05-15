import { AlignedData, RectH } from "uplot";
import { distr, SPACE_BETWEEN } from "./distr";
import uPlot from "uplot";
import { ceil, round } from "lodash";
import { pointWithin, Quadtree } from "./quadTree";
import { MutableRefObject } from "react";
import { SlotTransactions } from "../../../../api/types";
import { getDefaultStore } from "jotai";
import { logRatio } from "../../../../mathUtils";
import { barCountAtom } from "./atoms";
import { FilterEnum, stateColors } from "./consts";
import {
  getMaxFees,
  getMaxTips,
  getMaxCuConsumed,
  getMaxCuRequested,
  isTimeSeries,
  isTxnIdxSeries,
  getChartTxnState,
  isMicroblockSeries,
  bigIntRatio,
  isAdditionalSeries,
  txnIdxSidx,
  getCuIncomeRankingRatios,
} from "./txnBarsPluginUtils";
import { xScaleKey } from "../ComputeUnitsCard/consts";

const laneWidth = 1;
const laneDistr = SPACE_BETWEEN;

let stateSeriesHgt = 0;

export let focusedErrorCode: number;
export function highlightErrorCode(errorCode: number) {
  focusedErrorCode = errorCode;
}

let barCount = 0;
export const setBarCount = (count: number) => {
  barCount = count - 1;
  getDefaultStore().set(barCountAtom, barCount);
};

let pauseDrawing = false;
export const setPauseDrawing = (pause: boolean) => (pauseDrawing = pause);

export function txnBarsPlugin(
  transactionsRef: MutableRefObject<SlotTransactions | null | undefined>,
): uPlot.Plugin {
  let maxFees = 0n;
  let maxTips = 0n;
  let maxCuConsumed = 0;
  let maxCuRequested = 0;
  let cuIncomeRankingRatios: Record<number, number> = {};

  function setMaxFees() {
    maxFees = getMaxFees(transactionsRef);
  }
  function setMaxTips() {
    maxTips = getMaxTips(transactionsRef);
  }
  function setMaxCuConsumed() {
    maxCuConsumed = getMaxCuConsumed(transactionsRef);
  }
  function setMaxCuRequested() {
    maxCuRequested = getMaxCuRequested(transactionsRef);
  }
  function setCuIncomeRankingRatios() {
    cuIncomeRankingRatios = getCuIncomeRankingRatios(transactionsRef);
  }

  barCount = 1;

  const opts = {
    mode: 1,
    fill: (
      data: AlignedData,
      seriesIdx: number,
      dataIdx: number,
      value: number,
    ) => {
      if (!transactionsRef.current) return "";

      if (isTimeSeries(seriesIdx)) return "";
      if (isTxnIdxSeries(seriesIdx)) {
        return stateColors[
          getChartTxnState(data, dataIdx, transactionsRef.current, value)
        ];
      }

      if (isMicroblockSeries(seriesIdx)) {
        return "";
      }

      if (value === FilterEnum.FEES) {
        const txnIdx = data[txnIdxSidx][dataIdx] ?? -1;
        const fees =
          transactionsRef.current.txn_priority_fee[txnIdx] +
          transactionsRef.current.txn_transaction_fee[txnIdx];
        if (!fees) return "";

        const ratio = bigIntRatio(fees, maxFees, 4);
        const ratioScaled = Math.max(Math.min(0.8, ratio * 4), 0.3);
        return `rgba(76, 204, 230, ${ratioScaled})`;
      }

      if (value === FilterEnum.TIPS) {
        const txnIdx = data[txnIdxSidx][dataIdx] ?? -1;
        const tips = transactionsRef.current?.txn_tips[txnIdx];
        if (!tips) return "";

        const ratio = bigIntRatio(tips, maxTips, 4);
        const ratioScaled = Math.max(Math.min(0.8, ratio * 4), 0.3);
        return `rgba(31, 216, 164, ${ratioScaled})`;
      }

      if (value === FilterEnum.CUS_REQUESTED) {
        const txnIdx = data[txnIdxSidx][dataIdx] ?? -1;
        const cuRequested =
          transactionsRef.current?.txn_compute_units_requested[txnIdx];
        if (!cuRequested) return "";

        const ratio = cuRequested / maxCuRequested;
        const ratioScaled = Math.max(Math.min(0.85, ratio), 0.2);
        return `rgba(255, 141, 204, ${ratioScaled})`;
      }

      if (value === FilterEnum.CUS_CONSUMED) {
        const txnIdx = data[txnIdxSidx][dataIdx] ?? -1;
        const cuConsumed =
          transactionsRef.current?.txn_compute_units_consumed[txnIdx];
        if (!cuConsumed) return "";

        const ratio = cuConsumed / maxCuConsumed;
        const ratioScaled = Math.max(Math.min(0.85, ratio), 0.2);
        return `rgba(209, 157, 255, ${ratioScaled})`;
      }

      if (value === FilterEnum.INCOME_CUS) {
        const txnIdx = data[txnIdxSidx][dataIdx] ?? -1;
        const ratio = cuIncomeRankingRatios[txnIdx] ?? 0;
        const ratioScaled = Math.max(Math.min(0.8, ratio), 0.3);

        return `rgba(158, 177, 255, ${ratioScaled})`;
      }

      return "";
    },
    stroke: (
      data: AlignedData,
      seriesIdx: number,
      dataIdx: number,
      value: number,
    ) => {
      if (isTimeSeries(seriesIdx)) return "";

      if (isTxnIdxSeries(seriesIdx)) {
        return "";
      }

      if (isMicroblockSeries(seriesIdx)) {
        const txnIdx = data[txnIdxSidx][dataIdx] ?? -1;
        const errorCode = transactionsRef.current?.txn_error_code[txnIdx];
        if (focusedErrorCode) {
          if (errorCode === focusedErrorCode) {
            return "rgba(162,5,8, .8)";
          }

          return errorCode ? "rgba(162,5,8, .1)" : "rgba(19,173,79, .1)";
        }
        return errorCode ? "rgba(162,5,8, .5)" : "rgba(19,173,79, .5)";
      }

      return "";
    },
    align: undefined,
    size: undefined,
  };
  const { mode, fill, stroke } = opts;

  function walk(
    yIdx: number | null,
    count: number,
    dim: number,
    draw: {
      (iy: number, y0: number, hgt: number): void;
      (iy: number, y0: number, hgt: number): void;
      (arg0: number, arg1: number, arg2: number): void;
    },
  ) {
    distr(
      count,
      laneWidth,
      laneDistr,
      yIdx,
      (i: number, offPct: number, dimPct: number) => {
        const laneOffPx = dim * offPct;
        const laneWidPx = dim * dimPct;
        draw(i, laneOffPx, laneWidPx);
      },
    );
  }

  const size = opts.size ?? [0.6, Infinity];
  const align: number = opts.align ?? 0;

  const gapFactor = 1 - size[0];

  let font = "";
  let maxWidth = 0;

  function recalcDppxVars() {
    font = round(14 * uPlot.pxRatio) + "px Arial";
    maxWidth = (size[1] ?? Infinity) * uPlot.pxRatio;
  }

  recalcDppxVars();

  const fillPaths = new Map<string, Path2D>();
  const strokePaths = new Map<string, Path2D>();

  function drawBoxes(ctx: CanvasRenderingContext2D) {
    fillPaths.forEach((fillPath, fillStyle) => {
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill(fillPath);
      }
    });

    strokePaths.forEach((strokePath, strokeStyle) => {
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.stroke(strokePath);
      }
    });

    fillPaths.clear();
    strokePaths.clear();
  }

  function putBox(
    data: AlignedData,
    ctx: CanvasRenderingContext2D,
    rect: RectH,
    xOff: number,
    yOff: number,
    lft: number,
    top: number,
    wid: number,
    hgt: number,
    strokeWidth: number,
    iy: number,
    ix: number,
    value: number,
  ) {
    if (!transactionsRef.current) return;

    const sidx = iy + 1;
    const fillStyle = fill(data, sidx, ix, value);
    let fillPath = fillPaths.get(fillStyle);
    const txnIdx = data[txnIdxSidx][ix];

    // txn series should always be populated if we want to draw an additional series at that ts
    if (txnIdx == null) return;

    if (isAdditionalSeries(sidx)) {
      if (value === FilterEnum.FEES) {
        const fees =
          transactionsRef.current.txn_priority_fee[txnIdx] +
          transactionsRef.current.txn_transaction_fee[txnIdx];
        if (fees !== undefined) {
          let ratio = 1 / logRatio(Number(maxFees), Number(fees), 1.7);
          if (ratio > 0.9) ratio = 0.9;
          if (ratio < 0.1) ratio = 0.1;
          const ratioHgt = hgt * ratio;
          const diff = hgt - ratioHgt;
          hgt -= diff;
          top += diff;
        }
      }

      if (value === FilterEnum.TIPS) {
        const tips = transactionsRef.current?.txn_tips[txnIdx];
        if (tips !== undefined) {
          let ratio = 1 / logRatio(Number(maxTips), Number(tips), 1.7);

          if (ratio > 0.9) ratio = 0.9;
          if (ratio < 0.1) ratio = 0.1;
          const ratioHgt = hgt * ratio;
          const diff = hgt - ratioHgt;
          hgt -= diff;
          top += diff;
        }
      }

      if (value === FilterEnum.CUS_CONSUMED) {
        const cuConsumed =
          transactionsRef.current?.txn_compute_units_consumed[txnIdx];
        if (cuConsumed !== undefined) {
          let ratio = cuConsumed / maxCuConsumed;
          if (ratio > 0.9) ratio = 0.9;
          if (ratio < 0.1) ratio = 0.1;
          const ratioHgt = hgt * ratio;
          const diff = hgt - ratioHgt;
          hgt -= diff;
          top += diff;
        }
      }

      if (value === FilterEnum.CUS_REQUESTED) {
        const cuRequested =
          transactionsRef.current?.txn_compute_units_requested[txnIdx];
        if (cuRequested !== undefined) {
          let ratio = cuRequested / maxCuRequested;
          if (ratio > 0.9) ratio = 0.9;
          if (ratio < 0.1) ratio = 0.1;
          const ratioHgt = hgt * ratio;
          const diff = hgt - ratioHgt;
          hgt -= diff;
          top += diff;
        }
      }

      if (value === FilterEnum.INCOME_CUS) {
        let ratio = cuIncomeRankingRatios[txnIdx] ?? 0;
        if (ratio > 0.9) ratio = 0.95;
        if (ratio < 0.1) ratio = 0.1;
        const ratioHgt = hgt * ratio;
        const diff = hgt - ratioHgt;
        hgt -= diff;
        top += diff;
      }
    }

    if (fillPath == null) fillPaths.set(fillStyle, (fillPath = new Path2D()));
    rect(fillPath, lft, top, wid, hgt);

    if (strokeWidth) {
      const strokeStyle = stroke(data, sidx, ix, value);
      let strokePath = strokePaths.get(strokeStyle);

      if (strokePath == null)
        strokePaths.set(strokeStyle, (strokePath = new Path2D()));

      rect(
        strokePath,
        lft + strokeWidth / 2,
        top + strokeWidth / 2,
        wid - strokeWidth,
        hgt - strokeWidth,
      );
    }

    if (isMicroblockSeries(sidx)) return;

    qt.add({
      x: round(lft - xOff),
      y: round(top - yOff),
      w: wid,
      h: hgt,
      sidx: iy + (iy > 1 ? 2 : 1),
      didx: ix,
    });
  }

  function drawPaths(
    u: import("uplot"),
    sidx: number,
    idx0: number,
    idx1: number,
  ) {
    if (pauseDrawing) return;

    // setMaxFees();
    // setMaxTips();
    // setMaxCuConsumed();
    // setMaxCuRequested();
    // setCuIncomeRankingRatios();

    uPlot.orient(
      u,
      sidx,
      (
        series,
        dataX,
        dataY,
        scaleX,
        scaleY,
        valToPosX,
        valToPosY,
        xOff,
        yOff,
        xDim,
        yDim,
        moveTo,
        lineTo,
        rect,
      ) => {
        const strokeWidth = round((series.width || 0) * uPlot.pxRatio);

        u.ctx.save();
        rect(u.ctx, u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
        u.ctx.clip();

        walk(
          sidx - 1,
          barCount,
          yDim,
          (iy: number, y0: number, hgt: number) => {
            if ((isTimeSeries(sidx) || isTxnIdxSeries(sidx)) && hgt) {
              stateSeriesHgt = hgt;
            }
            // to collapse the microblock series on top of the txn state series
            if (!(isTimeSeries(sidx) || isTxnIdxSeries(sidx))) {
              y0 -= stateSeriesHgt;
            }
            // draw spans
            if (mode == 1) {
              for (let ix = 0; ix < dataY.length; ix++) {
                if (dataY[ix] != null) {
                  const lft = round(valToPosX(dataX[ix], scaleX, xDim, xOff));
                  let nextIx = ix;
                  while (
                    dataY[++nextIx] === undefined &&
                    nextIx < dataY.length
                  );

                  // to now (not to end of chart)
                  const rgt =
                    nextIx == dataY.length
                      ? xOff + xDim + strokeWidth
                      : round(valToPosX(dataX[nextIx], scaleX, xDim, xOff));

                  // To avoid excess drawing when zoomed, avoid drawing boxes past bbox
                  if (rgt >= u.bbox.left && lft <= u.bbox.left + u.bbox.width) {
                    const scaleDiff =
                      u.scales.x.min != null && u.scales.x.max != null
                        ? 400_000_000 / (u.scales.x.max - u.scales.x.min)
                        : undefined;
                    putBox(
                      u.data,
                      u.ctx,
                      rect,
                      xOff,
                      yOff,
                      lft,
                      // add some y axis buffer to the bar to the axis lines
                      round(yOff + y0) + 10,
                      // Limits the additional series bar widths vs letting them be the full width of the transaction
                      isAdditionalSeries(sidx)
                        ? Math.max(3, Math.min(rgt - lft, scaleDiff ?? 1))
                        : rgt - lft,
                      round(hgt) - 20,
                      strokeWidth,
                      iy,
                      ix,
                      dataY[ix] ?? 0,
                    );
                  }

                  ix = nextIx - 1;
                }
              }
            }
            // draw matrix
            else {
              const colWid =
                valToPosX(dataX[1], scaleX, xDim, xOff) -
                valToPosX(dataX[0], scaleX, xDim, xOff);
              const gapWid = colWid * gapFactor;
              const barWid = round(
                Math.min(maxWidth, colWid - gapWid) - strokeWidth,
              );
              const xShift = align == 1 ? 0 : align == -1 ? barWid : barWid / 2;

              for (let ix = idx0; ix <= idx1; ix++) {
                if (dataY[ix] != null) {
                  // TODO: all xPos can be pre-computed once for all series in aligned set
                  const lft = valToPosX(dataX[ix], scaleX, xDim, xOff);

                  putBox(
                    u.data,
                    u.ctx,
                    rect,
                    xOff,
                    yOff,
                    round(lft - xShift),
                    round(yOff + y0),
                    barWid,
                    round(hgt),
                    strokeWidth,
                    iy,
                    ix,
                    dataY[ix] ?? 0,
                  );
                }
              }
            }
          },
        );

        u.ctx.lineWidth = strokeWidth;
        drawBoxes(u.ctx);

        u.ctx.restore();
      },
    );

    return null;
  }

  // TODO: remove
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function drawPoints(
    u: import("uplot"),
    sidx: number,
    i0: number,
    i1: number,
  ) {
    u.ctx.save();
    u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
    u.ctx.clip();

    u.ctx.font = font;
    u.ctx.fillStyle = "black";
    u.ctx.textAlign = mode == 1 ? "left" : "center";
    u.ctx.textBaseline = "middle";

    uPlot.orient(
      u,
      sidx,
      (
        series,
        dataX,
        dataY,
        scaleX,
        scaleY,
        valToPosX,
        valToPosY,
        xOff,
        yOff,
        xDim,
        yDim,
        moveTo,
        lineTo,
        rect,
      ) => {
        const strokeWidth = round((series.width || 0) * uPlot.pxRatio);
        const textOffset = mode == 1 ? strokeWidth + 2 : 0;

        const y = round(yOff + yMids[sidx - 1]);

        for (let ix = 0; ix < dataY.length; ix++) {
          if (dataY[ix] != null) {
            const x = valToPosX(dataX[ix], scaleX, xDim, xOff) + textOffset;
            u.ctx.fillText(`${dataY[ix]}`, x, y);
          }
        }
      },
    );

    u.ctx.restore();

    return false;
  }

  let qt: {
    add: (arg0: {
      x: number;
      y: number;
      w: number;
      h: number;
      sidx: number;
      didx: number;
    }) => void;
    clear: () => void;
    get: (
      arg0: number,
      arg1: number,
      arg2: number,
      arg3: number,
      arg4: (o: { x: number; y: number; w: number; h: number }) => void,
    ) => void;
  };
  const hovered = Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    didx?: number;
  } | null>(barCount).fill(null);

  const yMids = Array<number>(barCount).fill(0);
  const ySplits = Array<number>(barCount).fill(0);

  const fmtDate = uPlot.fmtDate("{YYYY}-{MM}-{DD} {HH}:{mm}:{ss}");
  let legendTimeValueEl: { textContent: string } | null = null;

  return {
    hooks: {
      init: (u: {
        root: { querySelector: (arg0: string) => { textContent: string } };
      }) => {
        legendTimeValueEl = u.root.querySelector(
          ".u-series:first-child .u-value",
        );
        window.addEventListener("dppxchange", recalcDppxVars);

        setMaxFees();
        setMaxTips();
        setMaxCuConsumed();
        setMaxCuRequested();
        setCuIncomeRankingRatios();
      },
      destroy: (u) => {
        window.removeEventListener("dppxchange", recalcDppxVars);
      },
      drawClear: (u) => {
        qt = qt || new Quadtree(0, 0, u.bbox.width, u.bbox.height);

        qt.clear();

        // force-clear the path cache to cause drawBars() to rebuild new quadtree
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (u.series as any).forEach((s: { _paths: null }) => {
          s._paths = null;
        });
      },
      setCursor: (u: uPlot) => {
        if (mode == 1) {
          const val = u.posToVal(u.cursor.left ?? 0, xScaleKey);
          if (legendTimeValueEl)
            legendTimeValueEl.textContent = u.scales.x.time
              ? fmtDate(new Date(val * 1e3))
              : val.toFixed(2);
        }
      },
    },
    opts: (u: uPlot, opts: uPlot.Options) => {
      uPlot.assign(opts, {
        cursor: {
          sync: {
            key: xScaleKey,
            // setSeries: true,
            // scales: [xScaleKey],
            // match: [matchScaleKeys, matchScaleKeys, matchScaleKeys],
          },
          y: false,

          dataIdx: (
            u: { cursor: { left: number } },
            seriesIdx: number,
            closestIdx: number,
            xValue: number,
          ) => {
            if (isTimeSeries(seriesIdx)) return closestIdx;
            // Don't hover for microblock series
            if (isMicroblockSeries(seriesIdx)) return closestIdx;

            const cx = round(u.cursor.left * uPlot.pxRatio);

            if (cx >= 0) {
              const cy = yMids[seriesIdx - 1];

              hovered[seriesIdx - 1] = null;
              qt.get(cx, cy, 1, 1, (o) => {
                if (pointWithin(cx, cy, o.x, o.y, o.x + o.w, o.y + o.h)) {
                  hovered[seriesIdx - 1] = o;
                }
              });
            }

            return hovered[seriesIdx - 1]?.didx;
          },
          points: {
            fill: "rgba(255,255,255,0.2)",
            bbox: (u: uPlot, seriesIdx: number) => {
              const hRect = hovered[seriesIdx - 1];

              const res = {
                left: hRect ? round(hRect.x / devicePixelRatio) : -10,
                top: hRect ? round(hRect.y / devicePixelRatio) : -10,
                width: hRect ? round(hRect.w / devicePixelRatio) : 0,
                height: hRect ? round(hRect.h / devicePixelRatio) : 0,
              };

              const maxWidth =
                round((u.bbox.left + u.bbox.width) / devicePixelRatio) -
                res.left -
                10;

              // To clip hover overlay going past bbox
              if (res.width > maxWidth) {
                res.width = maxWidth;
              }

              return res;
            },
          },
        },
        scales: {
          x: {
            range(u: { data: number[][] }, min: number, max: number) {
              if (mode == 2) {
                const colWid = u.data[0][1] - u.data[0][0];
                const scalePad = colWid / 2;

                if (min <= u.data[0][0]) min = u.data[0][0] - scalePad;

                const lastIdx = u.data[0].length - 1;

                if (max >= u.data[0][lastIdx])
                  max = u.data[0][lastIdx] + scalePad;
              }

              return [min, max];
            },
          },
          y: {
            range: [0, 1],
          },
        },
      });

      if (opts.axes)
        uPlot.assign(opts.axes[0], {
          splits:
            mode == 2
              ? (
                  u: { data: number[][] },
                  axisIdx: number,
                  scaleMin: number,
                  scaleMax: number,
                  foundIncr: number,
                  foundSpace: number,
                ) => {
                  const splits = [];

                  const dataIncr = u.data[0][1] - u.data[0][0];
                  const skipFactor = ceil(foundIncr / dataIncr);

                  for (let i = 0; i < u.data[0].length; i += skipFactor) {
                    const v = u.data[0][i];

                    if (v >= scaleMin && v <= scaleMax) splits.push(v);
                  }

                  return splits;
                }
              : null,
          grid: {
            show: mode != 2,
          },
        });

      if (opts.axes)
        uPlot.assign(opts.axes[1], {
          splits: (u: uPlot, axisIdx: number) => {
            walk(
              null,
              barCount,
              u.bbox.height,
              (iy: number, y0: number, hgt: number) => {
                // vertical midpoints of each series' timeline (stored relative to .u-over)
                yMids[iy] = round(y0 + hgt / 2);
                ySplits[iy] = u.posToVal(yMids[iy] / uPlot.pxRatio, "y");
              },
            );

            return ySplits;
          },
          values: () =>
            Array(barCount)
              .fill(null)
              .map((v, i) => u.series[i + 1].label as string),
          gap: 5,
          // to hide the axis labels
          size: 0,
          grid: { show: false },
          ticks: { show: false },
          side: 3,
        });

      opts.series.forEach((s: object, i: number) => {
        if (i > 0) {
          uPlot.assign(s, {
            paths: drawPaths,
            // points: {
            //   show: drawPoints,
            // },
          });
        }
      });
    },
  };
}
