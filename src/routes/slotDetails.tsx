import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import SlotDetails from "../features/SlotDetails";

const searchParamsSchema = z.object({
  slot: z.number().optional().catch(undefined),
});

export const Route = createFileRoute("/slotDetails")({
  validateSearch: searchParamsSchema,
  component: SlotDetails,
});
