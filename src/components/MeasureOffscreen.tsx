import { useEffect, type PropsWithChildren } from "react";
import { Portal } from "radix-ui";
import { useAtomValue } from "jotai";
import { containerElAtom } from "../atoms";
import { useMeasure } from "react-use";
import type { UseMeasureRect } from "react-use/lib/useMeasure";

interface OffscreenProbeProps {
  onMeasured: (measureRect: UseMeasureRect) => void;
}

export default function MeasureOffscreen({
  onMeasured,
  children,
}: PropsWithChildren<OffscreenProbeProps>) {
  const containerEl = useAtomValue(containerElAtom);
  const [measureRef, measureRect] = useMeasure<HTMLDivElement>();

  useEffect(() => onMeasured(measureRect), [measureRect, onMeasured]);

  return (
    <Portal.Root
      container={containerEl}
      style={{
        position: "fixed",
        left: "-100000px",
        top: "-100000px",
        visibility: "hidden",
      }}
      ref={measureRef}
      aria-hidden="true"
    >
      {children}
    </Portal.Root>
  );
}
