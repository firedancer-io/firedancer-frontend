import { useSprings, animated } from "@react-spring/web";
import { useTheme, useMotionConfig } from "@nivo/core";
import {
  DefaultLink,
  DefaultNode,
  SankeyCommonProps,
  SankeyNodeDatum,
} from "./types";
import {
  droppedLabelColor,
  successLabelColor,
  baseLabelColor,
  zeroLabelColor,
} from "./consts";
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
} from "../features/Overview/SlotPerformance/SlotSankey/consts";

const store = getDefaultStore();

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
      let textAnchor;

      if (layout === "horizontal") {
        y = node.y + node.height / 2;
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

  const { animate, config: springConfig } = useMotionConfig();
  const springs = useSprings(
    labels.length,
    labels.map((label) => {
      return {
        transform: `translate(${label.x}, ${label.y}) rotate(${labelRotation})`,
        config: springConfig,
        immediate: !animate,
      };
    })
  );

  const usePct = store.get(sankeyDisplayTypeAtom) === DisplayType.Pct;

  return (
    <>
      {springs.map((animatedProps, index) => {
        const label = labels[index];
        const [labelFill, valueFill] = getLabelFill(
          label.label as SlotNode,
          label.value
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
              }}
            >
              <tspan x="0" dy="0em" style={{ fill: labelFill }}>
                {labelText}
              </tspan>
              <tspan x="0" dy="1em" style={{ fill: valueFill }}>
                {label.value?.toLocaleString()}
                {usePct && "%"}
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
    return [zeroLabelColor, zeroLabelColor];
  }

  if (retainedSlotNodes.includes(label)) {
    return [baseLabelColor, baseLabelColor];
  }
  if (label === SlotNode.BlockSuccess) {
    return [baseLabelColor, successLabelColor];
  }

  if (tileNodes.includes(label)) {
    return [zeroLabelColor, zeroLabelColor];
  }

  if (droppedSlotNodes.includes(label) || label === SlotNode.BlockFailure) {
    return [baseLabelColor, droppedLabelColor];
  }

  return [baseLabelColor, baseLabelColor];
}
