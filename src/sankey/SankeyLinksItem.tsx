import { createElement, useCallback, MouseEvent } from "react";
import { useSpring, animated } from "@react-spring/web";
import { useAnimatedPath } from "@nivo/core";
import { useTooltip } from "@nivo/tooltip";
import { SankeyLinkGradient } from "./SankeyLinkGradient";
import {
  DefaultLink,
  DefaultNode,
  SankeyCommonProps,
  SankeyLinkDatum,
} from "./types";
import {
  incomingSlotNodes,
  SlotNode,
  retainedSlotNodes,
  droppedSlotNodes,
  successfulSlotNodes,
  failedSlotNodes,
} from "../features/Overview/SlotPerformance/SlotSankey/consts";
import { useShowNode } from "./useShowNode";
import { useCustomMotionConfig } from "./useCustomMotionConfig";
import {
  failureColor,
  sankeyDroppedLinkColor,
  sankeyIncomingLinkColor,
  sankeyRetainedLinkColor,
  successColor,
  votesColor,
} from "../colors";

interface SankeyLinksItemProps<N extends DefaultNode, L extends DefaultLink> {
  link: SankeyLinkDatum<N, L>;
  layout: SankeyCommonProps<N, L>["layout"];
  path: string;
  color: string;
  opacity: number;
  blendMode: SankeyCommonProps<N, L>["linkBlendMode"];
  enableGradient: SankeyCommonProps<N, L>["enableLinkGradient"];
  setCurrent: (link: SankeyLinkDatum<N, L> | null) => void;
  isInteractive: SankeyCommonProps<N, L>["isInteractive"];
  onClick?: SankeyCommonProps<N, L>["onClick"];
  tooltip: SankeyCommonProps<N, L>["linkTooltip"];
}

export const SankeyLinksItem = <N extends DefaultNode, L extends DefaultLink>({
  link,
  layout,
  path,
  color,
  opacity,
  enableGradient,
  setCurrent,
  tooltip,
  isInteractive,
  onClick,
}: SankeyLinksItemProps<N, L>) => {
  const linkId = `${link.source.id}.${link.target.id}.${link.index}`;
  const { animate, config: springConfig } = useCustomMotionConfig();
  const animatedPath = useAnimatedPath(path);
  const animatedProps = useSpring({
    color,
    opacity,
    config: springConfig,
    immediate: !animate,
  });

  const { showTooltipFromEvent, hideTooltip } = useTooltip();

  const handleMouseEnter = useCallback(
    (event: MouseEvent<SVGPathElement>) => {
      setCurrent(link);
      showTooltipFromEvent(createElement(tooltip, { link }), event, "left");
    },
    [setCurrent, link, showTooltipFromEvent, tooltip],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent<SVGPathElement>) => {
      showTooltipFromEvent(createElement(tooltip, { link }), event, "left");
    },
    [showTooltipFromEvent, link, tooltip],
  );

  const handleMouseLeave = useCallback(() => {
    setCurrent(null);
    hideTooltip();
  }, [setCurrent, hideTooltip]);

  const handleClick = useCallback(
    (event: MouseEvent<SVGPathElement>) => {
      onClick?.(link, event);
    },
    [onClick, link],
  );
  let linkColor;
  if (incomingSlotNodes.includes(link.source.id as SlotNode)) {
    linkColor = sankeyIncomingLinkColor;
  } else if (
    retainedSlotNodes.includes(link.source.id as SlotNode) ||
    retainedSlotNodes.includes(link.target.id as SlotNode)
  ) {
    linkColor = sankeyRetainedLinkColor;
  } else if (successfulSlotNodes.includes(link.target.id as SlotNode)) {
    linkColor = successColor;
  } else if (failedSlotNodes.includes(link.target.id as SlotNode)) {
    linkColor = failureColor;
  } else if (link.target.id === SlotNode.Votes) {
    linkColor = votesColor;
  } else if (droppedSlotNodes.includes(link.target.id as SlotNode)) {
    linkColor = sankeyDroppedLinkColor;
  }

  const showNode = useShowNode(link.target.id as SlotNode, link.value);

  if (!showNode) return null;

  return (
    <>
      {enableGradient && (
        <SankeyLinkGradient
          id={linkId}
          layout={layout}
          startColor={link.startColor || link.source.color}
          endColor={link.endColor || link.target.color}
        />
      )}
      <animated.path
        fill={
          linkColor ??
          (enableGradient
            ? `url("#${encodeURI(linkId)}")`
            : animatedProps.color)
        }
        d={animatedPath}
        fillOpacity={animatedProps.opacity}
        onMouseEnter={isInteractive ? handleMouseEnter : undefined}
        onMouseMove={isInteractive ? handleMouseMove : undefined}
        onMouseLeave={isInteractive ? handleMouseLeave : undefined}
        onClick={isInteractive ? handleClick : undefined}
      />
    </>
  );
};
