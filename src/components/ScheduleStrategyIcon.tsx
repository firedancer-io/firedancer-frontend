import { useAtomValue } from "jotai";
import { clusterAtom } from "../api/atoms";
import { ScheduleStrategyEnum } from "../api/entities";
import type { ScheduleStrategy } from "../api/types";
import Balanced from "../assets/balanced.svg?react";
import Performance from "../assets/performance.svg?react";
import Revenue from "../assets/revenue.svg?react";
import { getClusterColor } from "../utils";
import { useMemo } from "react";

export function ScheduleStrategyIcon({
  strategy,
  iconSize,
}: {
  strategy: ScheduleStrategy;
  iconSize: number;
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
  if (strategy === ScheduleStrategyEnum.balanced) {
    return <Balanced {...svgProps} />;
  } else if (strategy === ScheduleStrategyEnum.perf) {
    return <Performance {...svgProps} />;
  } else if (strategy === ScheduleStrategyEnum.revenue) {
    return <Revenue {...svgProps} />;
  }
}
