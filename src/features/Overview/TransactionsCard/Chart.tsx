import { useLayoutEffect, useRef } from "react";
import { getDefaultStore } from "jotai";
import { useMeasure, useRafLoop } from "react-use";
import { tpsDataAtom } from "./atoms";
import {
  regularTextColor,
  transactionFailedPathColor,
  transactionNonVotePathColor,
  transactionVotePathColor,
} from "../../../colors";
import { WINDOW_MS } from "./consts";

const TOP_PADDING = 10;

const store = getDefaultStore();

export default function Chart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measureRef, { width, height }] = useMeasure<HTMLDivElement>();

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height]);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const data = store.get(tpsDataAtom);
    if (!data.length) return;

    const maxTotalY = data.reduce((max, p) => Math.max(max, p.tps.total), 0);
    if (maxTotalY === 0) return;

    const yRatio = (height - TOP_PADDING) / maxTotalY;
    const now = performance.now();

    const points = data.map((p) => ({
      x: width * (1 - (now - p.ts) / WINDOW_MS),
      voteY: p.tps.vote * yRatio,
      failedY: (p.tps.failed + p.tps.vote) * yRatio,
      successY: (p.tps.success + p.tps.failed + p.tps.vote) * yRatio,
    }));

    drawArea(
      ctx,
      points,
      width,
      height,
      "successY",
      transactionNonVotePathColor,
    );
    drawArea(ctx, points, width, height, "failedY", transactionFailedPathColor);
    drawArea(ctx, points, width, height, "voteY", transactionVotePathColor);

    drawPeakLine(ctx, width, height, maxTotalY * yRatio, maxTotalY);
  });

  return (
    <div ref={measureRef} style={{ position: "absolute", inset: 0 }}>
      <canvas ref={canvasRef} style={{ display: "block", width, height }} />
    </div>
  );
}

type Point = {
  x: number;
  voteY: number;
  failedY: number;
  successY: number;
};

function drawArea(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  canvasWidth: number,
  canvasHeight: number,
  heightKey: keyof Omit<Point, "x">,
  color: string,
) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, canvasHeight - points[0][heightKey]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, canvasHeight - points[i][heightKey]);
  }
  ctx.lineTo(canvasWidth, canvasHeight - points[points.length - 1][heightKey]);
  ctx.lineTo(canvasWidth, canvasHeight);
  ctx.lineTo(points[0].x, canvasHeight);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPeakLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  peakPixelHeight: number,
  peakTps: number,
) {
  const y = height - peakPixelHeight;
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.30)";
  ctx.lineWidth = 1;
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = regularTextColor;
  ctx.font = "8px 'Inter Tight'";
  ctx.fillText(peakTps.toLocaleString(), 0, y - 3);
}
