import { useSprings, animated } from "@react-spring/web";
import { useTheme } from "@nivo/core";
import type {
  DefaultLink,
  DefaultNode,
  SankeyCommonProps,
  SankeyNodeDatum,
} from "./types";
import { getDefaultStore } from "jotai";
import {
  DisplayType,
  sankeyDisplayTypeAtom,
} from "../features/Overview/SlotPerformance/atoms";
import ShowNode from "./ShowNode";
import {
  tileNodes,
  SlotNode,
  retainedSlotNodes,
  droppedSlotNodes,
  successfulSlotNodes,
  failedSlotNodes,
} from "../features/Overview/SlotPerformance/SlotSankey/consts";
import { useCustomMotionConfig } from "./useCustomMotionConfig";
import {
  failureColor,
  successColor,
  sankeyBaseLabelColor,
  secondaryTextColor,
  votesColor,
} from "../colors";
import type { SVGAttributes } from "react";

const store = getDefaultStore();

function getSuffix() {
  const displayType = store.get(sankeyDisplayTypeAtom);

  switch (displayType) {
    case DisplayType.Pct:
      return "%";
    case DisplayType.Rate:
      return "/s";
    case DisplayType.Count:
      return "";
  }
}

interface SankeyLabelsProps<N extends DefaultNode, L extends DefaultLink> {
  nodes: SankeyNodeDatum<N, L>[];
  layout: SankeyCommonProps<N, L>["layout"];
  width: number;
  height: number;
  labelPosition: SankeyCommonProps<N, L>["labelPosition"];
  labelPadding: SankeyCommonProps<N, L>["labelPadding"];
  labelOrientation: SankeyCommonProps<N, L>["labelOrientation"];
  getLabelTextColor: (node: SankeyNodeDatum<N, L>) => string;
}

export const SankeyLabels = <N extends DefaultNode, L extends DefaultLink>({
  nodes,
  layout,
  width,
  height,
  labelPosition,
  labelPadding,
  labelOrientation,
}: SankeyLabelsProps<N, L>) => {
  const theme = useTheme();

  const labelRotation = labelOrientation === "vertical" ? -90 : 0;
  const labels = nodes
    .filter((n) => !n.hideLabel)
    .map((node) => {
      let x;
      let y;
      let textAnchor: SVGAttributes<SVGTextElement>["textAnchor"];

      if (layout === "horizontal") {
        y = node.y + node.height / 2 - 5;
        if (node.alignLabelBottom) {
          y = node.y1;
        }
        if (tileNodes.includes(node.id as SlotNode)) {
          x = node.x0 + (node.x1 - node.x0) / 2;
          y = y + 10;
          textAnchor = "middle";
        } else if (node.labelPositionOverride === "right") {
          x = node.x1 + labelPadding;
          textAnchor = labelOrientation === "vertical" ? "middle" : "start";
        } else if (node.labelPositionOverride === "left") {
          x = node.x - labelPadding;
          textAnchor = labelOrientation === "vertical" ? "middle" : "end";
        } else if (node.x < width / 2) {
          if (labelPosition === "inside") {
            x = node.x1 + labelPadding;
            textAnchor = labelOrientation === "vertical" ? "middle" : "start";
          } else {
            x = node.x - labelPadding;
            textAnchor = labelOrientation === "vertical" ? "middle" : "end";
          }
        } else {
          if (labelPosition === "inside") {
            x = node.x - labelPadding;
            textAnchor = labelOrientation === "vertical" ? "middle" : "end";
          } else {
            x = node.x1 + labelPadding;
            textAnchor = labelOrientation === "vertical" ? "middle" : "start";
          }
        }
      } else if (layout === "vertical") {
        x = node.x + node.width / 2;
        if (node.y < height / 2) {
          if (labelPosition === "inside") {
            y = node.y1 + labelPadding;
            textAnchor = labelOrientation === "vertical" ? "end" : "middle";
          } else {
            y = node.y - labelPadding;
            textAnchor = labelOrientation === "vertical" ? "start" : "middle";
          }
        } else {
          if (labelPosition === "inside") {
            y = node.y - labelPadding;
            textAnchor = labelOrientation === "vertical" ? "start" : "middle";
          } else {
            y = node.y1 + labelPadding;
            textAnchor = labelOrientation === "vertical" ? "end" : "middle";
          }
        }
      }

      return {
        id: node.id,
        label: node.label,
        value: node.value,
        x,
        y,
        textAnchor,
      };
    });

  const { animate, config: springConfig } = useCustomMotionConfig();
  const springs = useSprings(
    labels.length,
    labels.map((label) => {
      return {
        transform: `translate(${label.x}, ${label.y}) rotate(${labelRotation})`,
        config: springConfig,
        immediate: !animate,
      };
    }),
  );

  return (
    <>
      {springs.map((animatedProps, index) => {
        const label = labels[index];
        const [labelFill, valueFill] = getLabelFill(
          label.label as SlotNode,
          label.value,
        );

        const labelText = label.label.split(":")[0]?.trim();

        return (
          <ShowNode
            node={label.label as SlotNode}
            value={label.value}
            key={label.id}
          >
            <animated.text
              key={label.id}
              dominantBaseline="central"
              textAnchor={label.textAnchor}
              transform={animatedProps.transform}
              style={{
                ...theme.labels.text,
                pointerEvents: "none",
                whiteSpace: "pre-line",
                fontSize: "14px",
                fontFamily: "Inter Tight",
              }}
            >
              {getLabelParts(labelText).map((part, i) => {
                return (
                  <tspan
                    key={part}
                    x="0"
                    dy={i === 0 ? "0em" : "1em"}
                    style={{ fill: labelFill }}
                  >
                    {part}
                  </tspan>
                );
              })}
              <tspan x="0" dy="1em" style={{ fill: valueFill }}>
                {label.value?.toLocaleString()}
                {getSuffix()}
              </tspan>
            </animated.text>
          </ShowNode>
        );
      })}
    </>
  );
};

function getLabelFill(label: SlotNode, value: number) {
  if (!value) {
    return [secondaryTextColor, secondaryTextColor];
  }

  if (retainedSlotNodes.includes(label)) {
    return [sankeyBaseLabelColor, sankeyBaseLabelColor];
  }
  if (successfulSlotNodes.includes(label)) {
    return [sankeyBaseLabelColor, successColor];
  }

  if (tileNodes.includes(label)) {
    return [secondaryTextColor, secondaryTextColor];
  }

  if (droppedSlotNodes.includes(label) || failedSlotNodes.includes(label)) {
    return [sankeyBaseLabelColor, failureColor];
  }

  if (label === SlotNode.Votes) {
    return [sankeyBaseLabelColor, votesColor];
  }

  return [sankeyBaseLabelColor, sankeyBaseLabelColor];
}

function getLabelParts(labelText: string) {
  if (labelText.length < 17 || !labelText.includes(" ")) return [labelText];

  const midIndex = Math.trunc(labelText.length / 2);
  const firstIndex = labelText.lastIndexOf(" ", midIndex);
  const lastIndex = labelText.indexOf(" ", midIndex + 1);
  const splitIndex =
    midIndex - firstIndex < lastIndex - midIndex || lastIndex === -1
      ? firstIndex
      : lastIndex;

  return [
    labelText.substring(0, splitIndex),
    labelText.substring(splitIndex + 1),
  ];
}
