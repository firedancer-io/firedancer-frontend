import { sankeyStartEndNodeColor } from "../colors";

interface SankeyNodesItemProps {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SankeyNodesItem = ({
  x,
  y,
  width,
  height,
}: SankeyNodesItemProps) => {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={sankeyStartEndNodeColor}
    />
  );
};
