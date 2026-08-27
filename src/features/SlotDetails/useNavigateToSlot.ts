import { useCallback } from "react";
import { navigate } from "../../router";

export function useNavigateToSlot() {
  const navigateToSlot = useCallback((slot?: number) => {
    navigate({ to: "/slotDetails", search: { slot }, replace: true });
  }, []);

  return navigateToSlot;
}
