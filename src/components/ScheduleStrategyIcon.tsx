import { useAtomValue } from "jotai";
import { clusterAtom } from "../api/atoms";
import { ScheduleStrategyEnum } from "../api/entities";
import type { ScheduleStrategy } from "../api/types";
import Balanced from "../assets/balanced.svg?react";
import Performance from "../assets/performance.svg?react";
import Revenue from "../assets/revenue.svg?react";
import { getClusterColor } from "../utils";
import { useMemo } from "react";
import { Tooltip } from "@radix-ui/themes";

export function ScheduleStrategyIcon({
  strategy,
  iconSize,
  tooltipContent,
}: {
  strategy: ScheduleStrategy;
  iconSize: number;
  tooltipContent?: string;
}) {
  const cluster = useAtomValue(clusterAtom);

  const svgProps = useMemo(
    () => ({
      width: `${iconSize}px`,
      height: `${iconSize}px`,
      color: getClusterColor(cluster),
    }),
    [cluster, iconSize],
  );
  const icon = useMemo(() => {
    if (strategy === ScheduleStrategyEnum.balanced) {
      return <Balanced {...svgProps} />;
    } else if (strategy === ScheduleStrategyEnum.perf) {
      return <Performance {...svgProps} />;
    } else if (strategy === ScheduleStrategyEnum.revenue) {
      return <Revenue {...svgProps} />;
    }
  }, [strategy, svgProps]);

  if (!tooltipContent) return icon;

  // Tooltip needs a child that supports forwards ref and
  // pointer events, such as div. SVG does not by default
  return (
    <Tooltip content={tooltipContent}>
      <div style={{ lineHeight: 0 }}>{icon}</div>
    </Tooltip>
  );
}
