import { createFileRoute } from "@tanstack/react-router";
import { getDefaultStore } from "jotai";
import { baseSelectedSlotAtoms } from "../features/Overview/SlotPerformance/atoms";
import { validateSlotDetailsSearch } from "./-searchValidators";

const store = getDefaultStore();

export const Route = createFileRoute("/slotDetails")({
  validateSearch: validateSlotDetailsSearch,
  beforeLoad: ({ search: { slot } }) =>
    store.set(baseSelectedSlotAtoms.slot, slot),
});
