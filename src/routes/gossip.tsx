import { createFileRoute } from "@tanstack/react-router";
import Gossip from "../features/Gossip";

export const Route = createFileRoute("/gossip")({
  component: Gossip,
});
