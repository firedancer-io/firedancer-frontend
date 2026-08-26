import { createLazyFileRoute } from "@tanstack/react-router";
import Gossip from "../features/Gossip";

export const Route = createLazyFileRoute("/gossip")({
  component: Gossip,
});
