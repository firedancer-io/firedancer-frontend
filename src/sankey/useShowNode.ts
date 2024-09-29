import { useState, useRef, useEffect } from "react";
import {
  SlotNode,
  incomingSlotNodes,
} from "../features/Overview/SlotPerformance/SlotSankey/consts";

export function useShowNode(node: SlotNode, value: number) {
  const [showNode, setShowNode] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const alwayShowNodes = [...incomingSlotNodes, SlotNode.SlotStart];
    if (alwayShowNodes.includes(node)) return;

    if (value) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      setShowNode(true);
    } else {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          setShowNode(false);
          timeoutRef.current = undefined;
        }, 3_000);
      }
    }
  }, [node, setShowNode, value]);

  return !!value || showNode;
}
