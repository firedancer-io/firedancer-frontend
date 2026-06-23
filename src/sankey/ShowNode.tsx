import type { PropsWithChildren } from "react";
import { useShowNode } from "./useShowNode";

export default function ShowNode({
  children,
  node,
  value,
}: PropsWithChildren<{
  node: string;
  value: number;
}>) {
  const showNode = useShowNode(node, value);
  if (!showNode) return null;

  return children;
}
