import { createLazyFileRoute } from "@tanstack/react-router";
import { LeaderSchedule } from "../features/LeaderSchedule";

export const Route = createLazyFileRoute("/leaderSchedule")({
  component: LeaderSchedule,
});
