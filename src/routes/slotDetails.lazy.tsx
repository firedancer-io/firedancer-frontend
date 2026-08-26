import { createLazyFileRoute } from "@tanstack/react-router";
import SlotDetails from "../features/SlotDetails";

export const Route = createLazyFileRoute("/slotDetails")({
  component: SlotDetails,
});
