import { useRef, useMemo, useLayoutEffect } from "react";
import { useDimensions } from "@nivo/core";
import { sankeyDefaultProps } from "./props";
import { useSankey } from "./hooks";
import { sankeyLinkHorizontal, sankeyLinkVertical } from "./links";
import {
  sankeyBaseLabelColor,
  sankeyLinkGradientEndColor,
  sankeyLinkGradientMiddleColor,
  sankeyStartEndNodeColor,
} from "../colors";
import type {
  DefaultLink,
  DefaultNode,
  SankeyCommonProps,
  SankeyLinkDatum,
  SankeyNodeDatum,
  SankeyProps,
} from "./types";
import { computeLabelLayout, getLabelParts, getSuffix } from "./labels";
import { getLinkId, useVisibility } from "./useVisibility";

const fontSize = 14;
const font = `${fontSize}px Inter Tight`;

export const Sankey = <
  N extends DefaultNode = DefaultNode,
  L extends DefaultLink = DefaultLink,
>({
  data,
  valueFormat,
  displayType = sankeyDefaultProps.displayType,
  layout = sankeyDefaultProps.layout,
  sort = sankeyDefaultProps.sort,
  align = sankeyDefaultProps.align,
  width,
  height,
  margin: partialMargin,
  colors = sankeyDefaultProps.colors,
  nodeThickness = sankeyDefaultProps.nodeThickness,
  nodeSpacing = sankeyDefaultProps.nodeSpacing,
  nodeInnerPadding = sankeyDefaultProps.nodeInnerPadding,
  linkContract = sankeyDefaultProps.linkContract,
  enableLinkGradient = sankeyDefaultProps.enableLinkGradient,
  enableLabels = sankeyDefaultProps.enableLabels,
  labelPosition = sankeyDefaultProps.labelPosition,
  labelPadding = sankeyDefaultProps.labelPadding,
  labelOrientation = sankeyDefaultProps.labelOrientation,
  getLabelFill,
  getLinkColor,
  label = sankeyDefaultProps.label,
  layers = sankeyDefaultProps.layers,
  role = sankeyDefaultProps.role,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
}: SankeyProps<N, L>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<(() => void) | null>(null);

  const { margin, innerWidth, innerHeight, outerWidth, outerHeight } =
    useDimensions(width, height, partialMargin);

  const { nodes, links } = useSankey<N, L>({
    data,
    valueFormat,
    layout,
    width: innerWidth,
    height: innerHeight,
    sort,
    align,
    colors,
    nodeThickness,
    nodeSpacing,
    nodeInnerPadding,
    label,
    displayType,
  });

  const linkItems = useMemo(
    () => links.map((l) => ({ id: getLinkId(l), value: l.value })),
    [links],
  );
  const nodeItems = useMemo(
    () => nodes.map((n) => ({ id: n.id, value: n.value })),
    [nodes],
  );

  const linkVisibilityRef = useVisibility(linkItems, drawRef);
  const nodeVisibilityRef = useVisibility(nodeItems, drawRef);

  const getLinkPath = useMemo(
    () =>
      layout === "horizontal"
        ? sankeyLinkHorizontal<N, L>()
        : sankeyLinkVertical<N, L>(),
    [layout],
  );

  // handle resizes
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(outerWidth * dpr);
    canvas.height = Math.round(outerHeight * dpr);
  }, [outerWidth, outerHeight]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, outerWidth, outerHeight);
      ctx.translate(margin.left, margin.top);

      for (const layer of layers) {
        if (layer === "links")
          drawLinks(
            ctx,
            links,
            layout,
            getLinkPath,
            linkContract,
            enableLinkGradient,
            getLinkColor,
            linkVisibilityRef.current,
          );
        else if (layer === "nodes") drawNodes(ctx, nodes);
        else if (layer === "labels" && enableLabels)
          drawLabels(
            ctx,
            nodes,
            layout,
            innerWidth,
            innerHeight,
            labelPosition,
            labelPadding,
            labelOrientation,
            getLabelFill,
            displayType,
            nodeVisibilityRef.current,
          );
      }

      ctx.restore();
    };

    drawRef.current = draw;
    draw();
  }, [
    nodes,
    links,
    linkVisibilityRef,
    nodeVisibilityRef,
    margin,
    outerWidth,
    outerHeight,
    innerWidth,
    innerHeight,
    layout,
    linkContract,
    labelPadding,
    labelPosition,
    labelOrientation,
    enableLinkGradient,
    enableLabels,
    layers,
    getLabelFill,
    getLinkColor,
    displayType,
    getLinkPath,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: outerWidth, height: outerHeight, display: "block" }}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    />
  );
};

function drawLinks<N extends DefaultNode, L extends DefaultLink>(
  ctx: CanvasRenderingContext2D,
  links: SankeyLinkDatum<N, L>[],
  layout: SankeyCommonProps<N, L>["layout"],
  getLinkPath: (link: SankeyLinkDatum<N, L>, contract: number) => string,
  linkContract: number,
  enableLinkGradient: boolean,
  getLinkColor: SankeyCommonProps<N, L>["getLinkColor"] | undefined,
  visibleLinks: Set<string>,
) {
  for (const link of links) {
    if (!visibleLinks.has(getLinkId(link))) continue;

    const solidColor = getLinkColor?.(link);
    if (solidColor != null) {
      ctx.fillStyle = solidColor;
    } else if (enableLinkGradient) {
      const gradient =
        layout === "horizontal"
          ? ctx.createLinearGradient(link.source.x1, 0, link.target.x0, 0)
          : ctx.createLinearGradient(0, link.source.y1, 0, link.target.y0);
      gradient.addColorStop(0, sankeyLinkGradientEndColor);
      gradient.addColorStop(0.24, sankeyLinkGradientMiddleColor);
      gradient.addColorStop(1, sankeyLinkGradientEndColor);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = link.color;
    }

    ctx.fill(new Path2D(getLinkPath(link, linkContract)));
  }
}

function drawNodes<N extends DefaultNode, L extends DefaultLink>(
  ctx: CanvasRenderingContext2D,
  nodes: SankeyNodeDatum<N, L>[],
) {
  ctx.fillStyle = sankeyStartEndNodeColor;
  for (const node of nodes) {
    ctx.fillRect(node.x, node.y, node.width, node.height);
  }
}

function drawLabels<N extends DefaultNode, L extends DefaultLink>(
  ctx: CanvasRenderingContext2D,
  nodes: SankeyNodeDatum<N, L>[],
  layout: SankeyCommonProps<N, L>["layout"],
  innerWidth: number,
  innerHeight: number,
  labelPosition: SankeyCommonProps<N, L>["labelPosition"],
  labelPadding: number,
  labelOrientation: SankeyCommonProps<N, L>["labelOrientation"],
  getLabelFill: SankeyCommonProps<N, L>["getLabelFill"] | undefined,
  displayType: SankeyCommonProps<N, L>["displayType"],
  visibleLabels: Set<string>,
) {
  const lineHeight = fontSize * 1.2;
  const labelRotation = labelOrientation === "vertical" ? -Math.PI / 2 : 0;
  const suffix = getSuffix(displayType);

  ctx.font = font;
  ctx.textBaseline = "middle";

  for (const node of nodes) {
    if (node.hideLabel) continue;
    if (!visibleLabels.has(node.id)) continue;

    const { x, y, textAlign } = computeLabelLayout(
      node,
      layout,
      innerWidth,
      innerHeight,
      labelPosition,
      labelPadding,
      labelOrientation,
    );

    const labelText = node.label.split(":")[0]?.trim() ?? "";
    const [labelFill, valueFill] = getLabelFill
      ? getLabelFill(node.id, node.value ?? 0)
      : [sankeyBaseLabelColor, sankeyBaseLabelColor];
    const parts = getLabelParts(labelText);

    ctx.save();
    ctx.textAlign = textAlign;
    ctx.translate(x, y);
    if (labelRotation !== 0) ctx.rotate(labelRotation);

    for (let i = 0; i < parts.length; i++) {
      ctx.fillStyle = labelFill;
      ctx.fillText(parts[i], 0, i * lineHeight);
    }
    ctx.fillStyle = valueFill;
    ctx.fillText(
      `${(node.value ?? 0).toLocaleString()}${suffix}`,
      0,
      parts.length * lineHeight,
    );

    ctx.restore();
  }
}
