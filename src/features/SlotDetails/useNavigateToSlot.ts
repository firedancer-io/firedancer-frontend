import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Route } from "../../routes/slotDetails";

export function useNavigateToSlot() {
  const navigate = useNavigate({
    from: Route.fullPath,
  });

  const navigateToSlot = useCallback(
    (slot?: number) => {
      void navigate({ search: { slot }, replace: true });
    },
    [navigate],
  );

  return navigateToSlot;
}
