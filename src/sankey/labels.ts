import {
  DisplayType,
  type DefaultLink,
  type DefaultNode,
  type SankeyCommonProps,
  type SankeyNodeDatum,
} from "./types";

export function getSuffix(displayType: DisplayType): string {
  switch (displayType) {
    case DisplayType.Pct:
      return "%";
    case DisplayType.Rate:
      return "/s";
    case DisplayType.Count:
      return "";
  }
}

export function getLabelParts(labelText: string) {
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

export function computeLabelLayout<
  N extends DefaultNode,
  L extends DefaultLink,
>(
  node: SankeyNodeDatum<N, L>,
  layout: SankeyCommonProps<N, L>["layout"],
  width: number,
  height: number,
  labelPosition: SankeyCommonProps<N, L>["labelPosition"],
  labelPadding: number,
  labelOrientation: SankeyCommonProps<N, L>["labelOrientation"],
): {
  x: number;
  y: number;
  textAlign: CanvasTextAlign;
} {
  let x = 0;
  let y = 0;
  let textAlign: CanvasTextAlign = "left";

  if (layout === "horizontal") {
    y = node.y + node.height / 2 - 5;
    if (node.alignLabelBottom) y = node.y1;

    if (node.labelPositionOverride === "center") {
      x = node.x0 + (node.x1 - node.x0) / 2;
      y = y + 10;
      textAlign = "center";
    } else if (node.labelPositionOverride === "right") {
      x = node.x1 + labelPadding;
      textAlign = labelOrientation === "vertical" ? "center" : "left";
    } else if (node.labelPositionOverride === "left") {
      x = node.x - labelPadding;
      textAlign = labelOrientation === "vertical" ? "center" : "right";
    } else if (node.x < width / 2) {
      if (labelPosition === "inside") {
        x = node.x1 + labelPadding;
        textAlign = labelOrientation === "vertical" ? "center" : "left";
      } else {
        x = node.x - labelPadding;
        textAlign = labelOrientation === "vertical" ? "center" : "right";
      }
    } else {
      if (labelPosition === "inside") {
        x = node.x - labelPadding;
        textAlign = labelOrientation === "vertical" ? "center" : "right";
      } else {
        x = node.x1 + labelPadding;
        textAlign = labelOrientation === "vertical" ? "center" : "left";
      }
    }
  } else if (layout === "vertical") {
    x = node.x + node.width / 2;
    if (node.y < height / 2) {
      if (labelPosition === "inside") {
        y = node.y1 + labelPadding;
        textAlign = labelOrientation === "vertical" ? "right" : "center";
      } else {
        y = node.y - labelPadding;
        textAlign = labelOrientation === "vertical" ? "left" : "center";
      }
    } else {
      if (labelPosition === "inside") {
        y = node.y - labelPadding;
        textAlign = labelOrientation === "vertical" ? "left" : "center";
      } else {
        y = node.y1 + labelPadding;
        textAlign = labelOrientation === "vertical" ? "right" : "center";
      }
    }
  }

  return { x, y, textAlign };
}
