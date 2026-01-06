import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import SlotDetails from "../features/SlotDetails";
import { getDefaultStore } from "jotai";
import { baseSelectedSlotAtoms } from "../features/Overview/SlotPerformance/atoms";

const store = getDefaultStore();

const searchParamsSchema = z.object({
  slot: z.number().optional().catch(undefined),
});

export const Route = createFileRoute("/slotDetails")({
  validateSearch: searchParamsSchema,
  component: SlotDetails,
  beforeLoad: ({ search: { slot } }) =>
    store.set(baseSelectedSlotAtoms.slot, slot),
});
