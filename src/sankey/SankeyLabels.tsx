import type {
  DefaultLink,
  DefaultNode,
  SankeyCommonProps,
  SankeyNodeDatum,
} from "./types";
import ShowNode from "./ShowNode";
import { sankeyBaseLabelColor } from "../colors";
import { computeLabelLayout, getLabelParts, getSuffix } from "./labels";

interface SankeyLabelsProps<N extends DefaultNode, L extends DefaultLink> {
  nodes: SankeyNodeDatum<N, L>[];
  displayType: SankeyCommonProps<N, L>["displayType"];
  layout: SankeyCommonProps<N, L>["layout"];
  width: number;
  height: number;
  labelPosition: SankeyCommonProps<N, L>["labelPosition"];
  labelPadding: SankeyCommonProps<N, L>["labelPadding"];
  labelOrientation: SankeyCommonProps<N, L>["labelOrientation"];
  getLabelFill?: SankeyCommonProps<N, L>["getLabelFill"];
}

export const SankeyLabels = <N extends DefaultNode, L extends DefaultLink>({
  nodes,
  displayType,
  layout,
  width,
  height,
  labelPosition,
  labelPadding,
  labelOrientation,
  getLabelFill,
}: SankeyLabelsProps<N, L>) => {
  const labelRotation = labelOrientation === "vertical" ? -90 : 0;
  const labels = nodes
    .filter((n) => !n.hideLabel)
    .map((node) => {
      const { x, y, textAnchor } = computeLabelLayout(
        node,
        layout,
        width,
        height,
        labelPosition,
        labelPadding,
        labelOrientation,
      );
      return {
        id: node.id,
        label: node.label,
        value: node.value,
        x,
        y,
        textAnchor,
      };
    });

  return (
    <>
      {labels.map((label) => {
        const [labelFill, valueFill] = getLabelFill
          ? getLabelFill(label.id, label.value)
          : [sankeyBaseLabelColor, sankeyBaseLabelColor];

        const labelText = label.label.split(":")[0]?.trim();

        return (
          <ShowNode node={label.id} value={label.value} key={label.id}>
            <text
              key={label.id}
              dominantBaseline="central"
              textAnchor={label.textAnchor}
              transform={`translate(${label.x}, ${label.y}) rotate(${labelRotation})`}
              className="sankey-label"
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
                {getSuffix(displayType)}
              </tspan>
            </text>
          </ShowNode>
        );
      })}
    </>
  );
};
