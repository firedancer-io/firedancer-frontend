import { createFileRoute } from "@tanstack/react-router";
import Overview from "../features/Overview";

export const Route = createFileRoute("/")({
  component: Overview,
});
