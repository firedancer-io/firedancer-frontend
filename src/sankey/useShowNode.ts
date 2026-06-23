import { useState, useRef, useEffect } from "react";

export function useShowNode(node: string, value: number) {
  const [showNode, setShowNode] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
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
