// From https://github.com/plouc/nivo/blob/master/packages/sankey/src/Sankey.tsx

import type { ReactNode } from "react";
import { createElement, Fragment } from "react";
import { SvgWrapper, useDimensions, Container } from "@nivo/core";
import { sankeyDefaultProps } from "./props";
import { useSankey } from "./hooks";
import { SankeyNodes } from "./SankeyNodes";
import { SankeyLinks } from "./SankeyLinks";
import { SankeyLabels } from "./SankeyLabels";
import type {
  DefaultLink,
  DefaultNode,
  SankeyLayerId,
  SankeyProps,
} from "./types";

const InnerSankey = <N extends DefaultNode, L extends DefaultLink>({
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

  const layerProps = {
    links,
    nodes,
    margin,
    width,
    height,
    outerWidth,
    outerHeight,
  };

  const layerById: Record<SankeyLayerId, ReactNode> = {
    links: null,
    nodes: null,
    labels: null,
  };

  if (layers.includes("links")) {
    layerById.links = (
      <SankeyLinks<N, L>
        key="links"
        links={links}
        layout={layout}
        linkContract={linkContract}
        enableLinkGradient={enableLinkGradient}
        getLinkColor={getLinkColor}
      />
    );
  }

  if (layers.includes("nodes")) {
    layerById.nodes = <SankeyNodes<N, L> key="nodes" nodes={nodes} />;
  }

  if (layers.includes("labels") && enableLabels) {
    layerById.labels = (
      <SankeyLabels<N, L>
        key="labels"
        nodes={nodes}
        displayType={displayType}
        layout={layout}
        width={innerWidth}
        height={innerHeight}
        labelPosition={labelPosition}
        labelPadding={labelPadding}
        labelOrientation={labelOrientation}
        getLabelFill={getLabelFill}
      />
    );
  }

  return (
    <SvgWrapper
      width={outerWidth}
      height={outerHeight}
      margin={margin}
      role={role}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
      ariaDescribedBy={ariaDescribedBy}
    >
      {layers.map((layer, i) => {
        if (typeof layer === "function") {
          return (
            <Fragment key={i}>{createElement(layer, layerProps)}</Fragment>
          );
        }

        return layerById?.[layer] ?? null;
      })}
    </SvgWrapper>
  );
};

export const Sankey = <
  N extends DefaultNode = DefaultNode,
  L extends DefaultLink = DefaultLink,
>(
  props: SankeyProps<N, L>,
) => (
  <Container>
    <InnerSankey<N, L> {...props} />
  </Container>
);
