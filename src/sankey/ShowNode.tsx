import { PropsWithChildren } from "react";
import { SlotNode } from "../features/Overview/SlotPerformance/SlotSankey/consts";
import { useShowNode } from "./useShowNode";

export default function ShowNode({
  children,
  node,
  value,
}: PropsWithChildren<{ node: SlotNode; value: number }>) {
  const showNode = useShowNode(node, value);
  if (!showNode) return null;

  return children;
}
