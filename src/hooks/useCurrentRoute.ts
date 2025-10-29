import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";

export type RouteLabel = "Overview" | "Schedule" | "Gossip" | "Slot Details";
export const RouteLabelToPath: Record<RouteLabel, string> = {
  Overview: "/",
  "Slot Details": "/slotDetails",
  Schedule: "/leaderSchedule",
  Gossip: "/gossip",
};

export function useCurrentRoute() {
  const location = useLocation();

  const currentRoute: RouteLabel = useMemo(() => {
    const match = Object.entries(RouteLabelToPath).find(
      ([_, path]) => location.pathname === path,
    );
    return match ? (match[0] as RouteLabel) : "Overview";
  }, [location.pathname]);

  return currentRoute;
}
