import { createFileRoute } from "@tanstack/react-router";
// zod/mini so only the checks used here land in the main bundle; the
// classic zod runtime stays out of it (worker-only)
import * as z from "zod/mini";
import { getDefaultStore } from "jotai";
import { baseSelectedSlotAtoms } from "../features/Overview/SlotPerformance/atoms";

const store = getDefaultStore();

const searchParamsSchema = z.object({
  slot: z.catch(z.optional(z.number()), undefined),
});

export const Route = createFileRoute("/slotDetails")({
  validateSearch: searchParamsSchema,
  beforeLoad: ({ search: { slot } }) =>
    store.set(baseSelectedSlotAtoms.slot, slot),
});
