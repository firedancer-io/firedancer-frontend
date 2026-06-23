import { DisplayType } from "./types";
import type { SankeyLayerId, SankeyAlignType } from "./types";
import {
  sankeyCenter,
  sankeyJustify,
  sankeyLeft,
  sankeyRight,
} from "../d3Sankey";

export const sankeyAlignmentPropMapping = {
  center: sankeyCenter,
  justify: sankeyJustify,
  start: sankeyLeft,
  end: sankeyRight,
};

export const sankeyAlignmentPropKeys = Object.keys(
  sankeyAlignmentPropMapping,
) as SankeyAlignType[];

export const sankeyAlignmentFromProp = (prop: SankeyAlignType) =>
  sankeyAlignmentPropMapping[prop];

export const sankeyDefaultProps = {
  displayType: DisplayType.Count,
  layout: "horizontal" as const,
  sort: "auto" as const,
  align: "center" as const,
  colors: { scheme: "nivo" as const },
  nodeThickness: 12,
  nodeSpacing: 12,
  nodeInnerPadding: 0,
  linkContract: 0,
  enableLinkGradient: false,
  enableLabels: true,
  labelPosition: "inside" as const,
  labelPadding: 9,
  labelOrientation: "horizontal" as const,
  label: "id",
  layers: ["links", "nodes", "labels"] as SankeyLayerId[],
  role: "img",
};
