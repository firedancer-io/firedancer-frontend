import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import SlotDetails from "../features/SlotDetails";

const searchParamsSchema = z.object({
  slot: fallback(z.number().optional(), undefined),
});

export const Route = createFileRoute("/slotDetails")({
  validateSearch: zodValidator(searchParamsSchema),
  component: SlotDetails,
});
