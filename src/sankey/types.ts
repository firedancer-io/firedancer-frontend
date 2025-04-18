import { AriaAttributes, MouseEvent, FunctionComponent } from "react";
import {
  Box,
  Theme,
  CssMixBlendMode,
  Dimensions,
  MotionProps,
  PropertyAccessor,
  ValueFormat,
} from "@nivo/core";
import { InheritedColorConfig, OrdinalColorScaleConfig } from "@nivo/colors";
import { LegendProps } from "@nivo/legends";
import { SankeyNodeMinimal } from "../d3Sankey";

export interface SankeyRawNode {
  id: string;
}

export interface DefaultNode {
  id: string;
}

export interface DefaultLink {
  source: string;
  target: string;
  value: number;
  // start/end color can optionally be used to have custom gradients
  startColor?: string;
  endColor?: string;
}

export interface SankeyRawLink {
  source: string;
  target: string;
  value: number;
  // start/end color can optionally be used to have custom gradients
  startColor?: string;
  endColor?: string;
}

type ExtraLinkProps<L extends DefaultLink> = Omit<
  L,
  "source" | "target" | "value"
>;

export type SankeyLinkDatum<
  N extends DefaultNode,
  L extends DefaultLink,
> = ExtraLinkProps<L> & {
  // base properties generated by d3-sankey
  value: number;
  index: number;
  source: SankeyNodeDatum<N, L>;
  target: SankeyNodeDatum<N, L>;
  // custom nivo properties
  pos0: number;
  pos1: number;
  thickness: number;
  color: string;
  formattedValue: string;
  // start/end color can optionally be used to have custom gradients
  startColor?: string;
  endColor?: string;
};

export type SankeyNodeDatum<
  N extends DefaultNode,
  L extends DefaultLink,
> = N & {
  // base properties generated by d3-sankey
  depth: number;
  index: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  value: number;
  // custom nivo properties
  color: string;
  label: string;
  formattedValue: string;
  layer: number;
  sourceLinks: SankeyLinkDatum<N, L>[];
  targetLinks: SankeyLinkDatum<N, L>[];
  x: number;
  y: number;
  width: number;
  height: number;

  hideLabel?: boolean;
  labelPositionOverride?: "right" | "left";
  alignLabelBottom?: boolean;

  isStartNode?: boolean;
  isEndNode?: boolean;
};

export interface SankeyDataProps<N extends DefaultNode, L extends DefaultLink> {
  data: {
    nodes: N[];
    links: L[];
  };
}

export type SankeyLayerId = "links" | "nodes" | "labels" | "legends";

export type SankeyMouseHandler<N extends DefaultNode, L extends DefaultLink> = (
  data: SankeyNodeDatum<N, L> | SankeyLinkDatum<N, L>,
  event: MouseEvent,
) => void;

export type SankeyAlignType = "center" | "justify" | "start" | "end";
export type SankeyAlignFunction = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: SankeyNodeMinimal<any, any>,
  n: number,
) => number;

export type SankeySortType = "auto" | "input" | "ascending" | "descending";
export type SankeySortFunction<N extends DefaultNode, L extends DefaultLink> = (
  a: SankeyNodeDatum<N, L>,
  b: SankeyNodeDatum<N, L>,
) => number;

export interface SankeyCommonProps<
  N extends DefaultNode,
  L extends DefaultLink,
> {
  // formatting for link value
  valueFormat: ValueFormat<number>;

  layout: "horizontal" | "vertical";
  align: SankeyAlignType | SankeyAlignFunction;
  sort: SankeySortType | SankeySortFunction<N, L>;

  layers: SankeyLayerId[];

  margin: Box;

  colors: OrdinalColorScaleConfig<
    Omit<SankeyNodeDatum<N, L>, "color" | "label">
  >;
  theme: Theme;

  nodeOpacity: number;
  nodeHoverOpacity: number;
  nodeHoverOthersOpacity: number;
  nodeThickness: number;
  nodeSpacing: number;
  nodeInnerPadding: number;
  nodeBorderWidth: number;
  nodeBorderColor: InheritedColorConfig<SankeyNodeDatum<N, L>>;
  nodeBorderRadius: number;

  linkOpacity: number;
  linkHoverOpacity: number;
  linkHoverOthersOpacity: number;
  linkContract: number;
  linkBlendMode: CssMixBlendMode;
  enableLinkGradient: boolean;

  enableLabels: boolean;
  label: PropertyAccessor<
    Omit<SankeyNodeDatum<N, L>, "color" | "label">,
    string
  >;
  labelPosition: "inside" | "outside";
  labelPadding: number;
  labelOrientation: "horizontal" | "vertical";
  labelTextColor: InheritedColorConfig<SankeyNodeDatum<N, L>>;

  isInteractive: boolean;
  onClick: SankeyMouseHandler<N, L>;
  nodeTooltip: FunctionComponent<{ node: SankeyNodeDatum<N, L> }>;
  linkTooltip: FunctionComponent<{ link: SankeyLinkDatum<N, L> }>;

  legends: LegendProps[];

  renderWrapper: boolean;

  role: string;
  ariaLabel: AriaAttributes["aria-label"];
  ariaLabelledBy: AriaAttributes["aria-labelledby"];
  ariaDescribedBy: AriaAttributes["aria-describedby"];
}

export type SankeySvgProps<
  N extends DefaultNode,
  L extends DefaultLink,
> = Partial<SankeyCommonProps<N, L>> &
  SankeyDataProps<N, L> &
  Dimensions &
  MotionProps;
