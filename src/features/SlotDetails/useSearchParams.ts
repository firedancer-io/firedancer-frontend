import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Route } from "../../routes/slotDetails";

export function useSlotSearchParam() {
  const search = Route.useSearch();
  const navigate = useNavigate({
    from: Route.fullPath,
  });

  const setSelectedSlot = useCallback(
    (slot?: number) => {
      void navigate({ search: { slot }, replace: true });
    },
    [navigate],
  );

  return { selectedSlot: search?.slot, setSelectedSlot };
}
