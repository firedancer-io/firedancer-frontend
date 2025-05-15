import uPlot from "uplot";
import { SlotTransactions } from "../../../../api/types";
import { RefObject } from "react";
import { computeUnitsScaleKey, xScaleKey } from "./consts";
import { round } from "lodash";

interface Point {
  x: number;
  y: number;
}

type LinePoints = [Point, Point];

const cusPerNs = 1 / 9;

interface BankColor {
  color: string;
  opacity?: number;
}

const bankCuColors: BankColor[] = [
  { color: "42 126 223" }, // reference line for max cu
  { color: "30 156 80" },
  { color: "30 156 80", opacity: 0.15 },
  { color: "174 85 17", opacity: 0.15 },
  { color: "244 5 5", opacity: 0.15 },
  { color: "244 5 5", opacity: 0.2 },
];

const getBankCuColor = (index: number) => {
  return bankCuColors[index] ?? bankCuColors[bankCuColors.length - 1];
};

function getTsAtCu({
  computeUnits,
  bankCount,
  tEnd,
  maxComputeUnits,
}: {
  computeUnits: number;
  bankCount: number;
  tEnd: number;
  maxComputeUnits: number;
}) {
  return Math.round(
    (computeUnits - maxComputeUnits) / bankCount / cusPerNs + tEnd,
  );
}

function getLineWithinScales(
  scaleBounds: [Point, Point][],
  lineStart: Point,
  lineEnd: Point,
) {
  const intersections: Point[] = [];

  function getIntersection(
    lineStart: Point,
    lineEnd: Point,
    boundaryStart: Point,
    boundaryEnd: Point,
  ) {
    const denominator =
      (lineStart.x - lineEnd.x) * (boundaryStart.y - boundaryEnd.y) -
      (lineStart.y - lineEnd.y) * (boundaryStart.x - boundaryEnd.x);

    // If denominator is zero, lines are parallel
    if (denominator === 0) return;

    const t =
      ((lineStart.x - boundaryStart.x) * (boundaryStart.y - boundaryEnd.y) -
        (lineStart.y - boundaryStart.y) * (boundaryStart.x - boundaryEnd.x)) /
      denominator;

    const u =
      ((lineStart.x - boundaryStart.x) * (lineStart.y - lineEnd.y) -
        (lineStart.y - boundaryStart.y) * (lineStart.x - lineEnd.x)) /
      denominator;

    if (t < 0 || t > 1 || u < 0 || u > 1) return;

    return {
      x: lineStart.x + t * (lineEnd.x - lineStart.x),
      y: lineStart.y + t * (lineEnd.y - lineStart.y),
    };
  }

  for (const bound of scaleBounds) {
    const intersection = getIntersection(
      lineStart,
      lineEnd,
      bound[0],
      bound[1],
    );
    if (intersection) {
      intersections.push(intersection);
    }
  }

  if (!intersections.length) return;

  if (intersections.length !== 2) console.debug(intersections);

  return intersections.sort((a, b) => a.x - b.x) as [Point, Point];
}

function getRefLinesWithinScales(
  xScale: uPlot.Scale,
  yScale: uPlot.Scale,
  slotTransactions: SlotTransactions,
  maxComputeUnits: number,
  bankTileCount: number,
) {
  const tEnd = Number(
    slotTransactions.target_end_timestamp_nanos -
      slotTransactions.start_timestamp_nanos,
  );

  const left = xScale.min ?? 0;
  const right = xScale.max ?? tEnd;
  const top = yScale.max ?? maxComputeUnits;
  const bottom = yScale.min ?? 0;

  const scaleBounds: [Point, Point][] = [
    // top
    [
      { x: left, y: top },
      { x: right, y: top },
    ],
    // left
    [
      { x: left, y: top },
      { x: left, y: bottom },
    ],
    // bottom
    [
      { x: left, y: bottom },
      { x: right, y: bottom },
    ],
    // right
    [
      { x: right, y: top },
      { x: right, y: bottom },
    ],
  ];

  const refLines: { line: [Point, Point]; bankCount: number }[] = [];

  for (let bankCount = 1; bankCount <= bankTileCount; bankCount++) {
    const cuStartTs = getTsAtCu({
      computeUnits: 0,
      tEnd,
      maxComputeUnits,
      bankCount,
    });

    const cuEndTs = getTsAtCu({
      computeUnits: maxComputeUnits,
      tEnd,
      maxComputeUnits,
      bankCount,
    });

    const refLine = getLineWithinScales(
      scaleBounds,
      { x: cuStartTs, y: 0 },
      { x: cuEndTs, y: maxComputeUnits },
    );

    if (refLine) {
      refLines.push({ line: refLine, bankCount });
    }
  }

  return refLines;
}

function getBboxPoints(bbox: uPlot.BBox): Point[] {
  return [
    { x: bbox.left, y: bbox.top + bbox.height }, // bottom left
    { x: bbox.left + bbox.width, y: bbox.top + bbox.height }, // bottom right
    { x: bbox.left + bbox.width, y: bbox.top }, // top right
    { x: bbox.left, y: bbox.top }, // top left
  ];
}

/** For precision differences when calculating coordinates, considers points the same position if within a buffer */
function withinBuffer(a: number, b: number) {
  return Math.abs(a - b) < 2;
}

function getPolygonPoints(
  bbox: uPlot.BBox,
  prevLine: LinePoints,
  curLine: LinePoints,
): Point[] {
  const bboxCorners = getBboxPoints(bbox);
  const polygonPoints = [...prevLine, ...curLine];
  // Adding bbox corners if they are within the lines
  for (const cornerPoint of bboxCorners) {
    if (
      ((cornerPoint.x >= prevLine[0].x ||
        withinBuffer(cornerPoint.x, prevLine[0].x)) &&
        (cornerPoint.x <= curLine[0].x ||
          withinBuffer(cornerPoint.x, curLine[0].x)) &&
        (cornerPoint.y >= prevLine[0].y ||
          withinBuffer(cornerPoint.y, prevLine[0].y)) &&
        (cornerPoint.y <= curLine[0].y ||
          withinBuffer(cornerPoint.y, curLine[0].y))) ||
      ((cornerPoint.x >= prevLine[1].x ||
        withinBuffer(cornerPoint.x, prevLine[1].x)) &&
        (cornerPoint.x <= curLine[1].x ||
          withinBuffer(cornerPoint.x, curLine[1].x)) &&
        (cornerPoint.y >= prevLine[1].y ||
          withinBuffer(cornerPoint.y, prevLine[1].y)) &&
        (cornerPoint.y <= curLine[1].y ||
          withinBuffer(cornerPoint.y, curLine[1].y)))
    ) {
      polygonPoints.push(cornerPoint);
    }
  }

  const center: Point = {
    x: polygonPoints.reduce((sum, p) => sum + p.x, 0) / polygonPoints.length,
    y: polygonPoints.reduce((sum, p) => sum + p.y, 0) / polygonPoints.length,
  };

  // Sort counterclockwise by angle
  polygonPoints.sort((a, b) => {
    const angleA = Math.atan2(a.y - center.y, a.x - center.x);
    const angleB = Math.atan2(b.y - center.y, b.x - center.x);
    return angleA - angleB;
  });

  return polygonPoints;
}

function fillBetweenLines(
  ctx: CanvasRenderingContext2D,
  bbox: uPlot.BBox,
  prevLine: LinePoints,
  curLine: LinePoints,
  bankColor: BankColor,
) {
  if (!bankColor.opacity) return;

  const points = getPolygonPoints(bbox, prevLine, curLine);
  if (points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let j = 1; j < points.length; j++) {
      ctx.lineTo(points[j].x, points[j].y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgb(${bankColor.color} / ${bankColor.opacity})`;
    ctx.fill();
  }
}

function getBankCount({
  computeUnits,
  ts,
  tEnd,
  maxComputeUnits,
}: {
  computeUnits: number;
  ts: number;
  tEnd: number;
  maxComputeUnits: number;
}) {
  return Math.trunc((computeUnits - maxComputeUnits) / cusPerNs / (ts - tEnd));
}

let font = "bold 12px Inter Tight";

function recalcDppxVars() {
  font = `bold ${round(12 * uPlot.pxRatio)}px Inter Tight`;
}

export function cuRefAreaPlugin({
  slotTransactionsRef,
  maxComputeUnitsRef,
  bankTileCountRef,
}: {
  slotTransactionsRef: RefObject<SlotTransactions>;
  maxComputeUnitsRef: RefObject<number>;
  bankTileCountRef: RefObject<number>;
}): uPlot.Plugin {
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

          const slotTransactions = slotTransactionsRef.current;
          const maxComputeUnits = maxComputeUnitsRef.current;
          const bankTileCount = bankTileCountRef.current;
          if (
            slotTransactions === null ||
            maxComputeUnits === null ||
            bankTileCount === null
          )
            return;

          const ctx = u.ctx;

          ctx.save();

          const slotDurationNanos = Number(
            slotTransactions.target_end_timestamp_nanos -
              slotTransactions.start_timestamp_nanos,
          );
          const refLineMaxComputeUnits = Math.trunc(
            maxComputeUnits + 0.05 * slotDurationNanos * cusPerNs,
          );

          const refLines = getRefLinesWithinScales(
            u.scales[xScaleKey],
            u.scales[computeUnitsScaleKey],
            slotTransactions,
            refLineMaxComputeUnits,
            bankTileCount,
          );

          // Adding a max CU line unrelated to bank count
          refLines.unshift({
            line: [
              { x: u.scales[xScaleKey].min ?? 0, y: maxComputeUnits },
              { x: u.scales[xScaleKey].max ?? 450_000_000, y: maxComputeUnits },
            ],
            bankCount: 0,
          });

          const refAreaLines: { line: [Point, Point]; bankCount: number }[] =
            [];

          recalcDppxVars();
          // For bank count label
          ctx.font = font;

          const prevXY = { x: -100, y: 30 };

          for (let i = 0; i < refLines.length; i++) {
            const { line, bankCount } = refLines[i];
            const x0 = Math.round(u.valToPos(line[0].x, xScaleKey, true));
            const y0 = Math.round(
              u.valToPos(line[0].y, computeUnitsScaleKey, true),
            );
            const x1 = Math.round(u.valToPos(line[1].x, xScaleKey, true));
            const y1 = Math.round(
              u.valToPos(line[1].y, computeUnitsScaleKey, true),
            );
            const bankColor = getBankCuColor(bankCount);

            ctx.beginPath();
            ctx.strokeStyle = `rgb(${bankColor.color})`; // "rgba(100, 100, 100, 1)";
            // ctx.strokeStyle = s.stroke?.toString() || "white";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();

            // to avoid drawing an area for the max compute unit ref line
            if (bankCount) {
              refAreaLines.push({
                line: [
                  { x: x0, y: y0 },
                  { x: x1, y: y1 },
                ],
                bankCount,
              });

              const xSpacingBetweenText = 50;
              const ySpacingBetweenText = 20;

              if (
                // Keeps enough space between text when line starts on x axis
                (!withinBuffer(x0, u.bbox.left) &&
                  Math.abs(x0 - prevXY.x) >
                    uPlot.pxRatio * xSpacingBetweenText) ||
                // Keeps enough space between text when line starts on y axis
                (withinBuffer(x0, u.bbox.left) &&
                  Math.abs(y0 - prevXY.y) > uPlot.pxRatio * ySpacingBetweenText)
              ) {
                ctx.save();

                const angle = Math.atan2(y1 - y0, x1 - x0);
                ctx.translate(x0, y0);
                ctx.rotate(angle);

                ctx.fillStyle = ctx.strokeStyle;
                const text = `${bankCount - 1} Bank${bankCount === 2 ? "" : "s"} Active`;
                // Leave enough space to not overflow past the bbox
                if (
                  ctx.measureText(text).width <=
                  u.bbox.left + u.bbox.width - x0
                ) {
                  ctx.fillText(text, 4 * uPlot.pxRatio, -8 * uPlot.pxRatio);
                }

                ctx.restore();
              }

              prevXY.x = x0;
              prevXY.y = y0;
            }
          }

          if (refAreaLines.length > 0) {
            refAreaLines.unshift({
              line: [
                {
                  x: u.bbox.left,
                  y: withinBuffer(refAreaLines[0].line[0].x, u.bbox.left)
                    ? refAreaLines[0].line[0].y
                    : u.bbox.top + u.bbox.height,
                },
                { x: u.bbox.left, y: u.bbox.top },
              ],
              bankCount: refAreaLines[0].bankCount - 1,
            });
            refAreaLines.push({
              line: [
                {
                  x: u.bbox.left + u.bbox.width,
                  y: u.bbox.top + u.bbox.height,
                },
                {
                  x: u.bbox.left + u.bbox.width,
                  y: withinBuffer(
                    refAreaLines[refAreaLines.length - 1].line[1].x,
                    u.bbox.left + u.bbox.width,
                  )
                    ? refAreaLines[refAreaLines.length - 1].line[1].y
                    : u.bbox.top,
                },
              ],
              bankCount: refAreaLines[refAreaLines.length - 1].bankCount + 1,
            });

            for (let i = 1; i < refAreaLines.length; i++) {
              const prevLine = refAreaLines[i - 1];
              const curLine = refAreaLines[i];

              fillBetweenLines(
                ctx,
                u.bbox,
                prevLine.line,
                curLine.line,
                getBankCuColor(curLine?.bankCount ?? prevLine.bankCount),
              );
            }
          }
          // Drawing the entire area of the current bank count if no ref lines to seperate them
          else {
            const midComputeUnits =
              u.scales[computeUnitsScaleKey].max ??
              0 - (u.scales[computeUnitsScaleKey].min ?? 0);
            const midTs =
              u.scales[xScaleKey].max ?? 0 - (u.scales[xScaleKey].min ?? 0);
            // scale shown is between reference lines
            const tEnd = Number(
              slotTransactions.target_end_timestamp_nanos -
                slotTransactions.start_timestamp_nanos,
            );
            const bankCount = Math.min(
              bankTileCount,
              Math.abs(
                getBankCount({
                  computeUnits: midComputeUnits,
                  ts: midTs,
                  tEnd,
                  maxComputeUnits: refLineMaxComputeUnits,
                }),
              ) + 1,
            );
            const bankColor = getBankCuColor(bankCount);
            if (bankColor.opacity) {
              const corners = getBboxPoints(u.bbox);
              ctx.beginPath();
              ctx.moveTo(corners[0].x, corners[0].y);
              for (let j = 1; j < corners.length; j++) {
                ctx.lineTo(corners[j].x, corners[j].y);
              }
              ctx.closePath();
              ctx.fillStyle = `rgb(${bankColor.color} / ${bankColor.opacity})`;
              ctx.fill();

              ctx.fillStyle = `rgb(${bankColor.color})`;
              const text = `${bankCount - 1} Bank${bankCount === 2 ? "" : "s"} Active`;
              const { width } = ctx.measureText(text);
              ctx.fillText(
                text,
                u.bbox.left + u.bbox.width - width - 5,
                u.bbox.top + u.bbox.height - 15,
              );
            }
          }

          ctx.restore();
        },
      ],
    },
  };
}
