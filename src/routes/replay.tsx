import { createFileRoute } from "@tanstack/react-router";
import Replay from "../features/Replay";

export const Route = createFileRoute("/replay")({
  component: Replay,
});
