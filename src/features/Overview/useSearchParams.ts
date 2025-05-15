import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { Route as OverviewRoute } from "../../routes";
import { Route as SlotRoute } from "../../routes/slotDetails";

export function useSlotSearchParam() {
  const location = useLocation();
  // TODO: fix assumption that it has to be these 2 routes. This PR doesn't work: https://github.com/TanStack/router/pull/3642
  const search = useSearch({ from: location.pathname as "/" | "/slotDetails" });
  const navigate = useNavigate({
    from: location.pathname.startsWith("/slot")
      ? SlotRoute.fullPath
      : OverviewRoute.fullPath,
  });

  const setSelectedSlot = useCallback(
    (slot?: number) => {
      void navigate({ search: { slot }, replace: true });
    },
    [navigate],
  );

  return { selectedSlot: search?.slot, setSelectedSlot };
}
