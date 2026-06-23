import type { DefaultLink, DefaultNode, SankeyNodeDatum } from "./types";
import { SankeyNodesItem } from "./SankeyNodesItem";

interface SankeyNodesProps<N extends DefaultNode, L extends DefaultLink> {
  nodes: SankeyNodeDatum<N, L>[];
}

export const SankeyNodes = <N extends DefaultNode, L extends DefaultLink>({
  nodes,
}: SankeyNodesProps<N, L>) => {
  return (
    <>
      {nodes.map((node) => (
        <SankeyNodesItem
          key={node.id}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
        />
      ))}
    </>
  );
};
