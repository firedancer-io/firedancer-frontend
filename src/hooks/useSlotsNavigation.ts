import { narrowNavMedia } from "../consts";
import { useCurrentRoute } from "./useCurrentRoute";
import { useAtom } from "jotai";
import { _isNavCollapsedAtom } from "../atoms";
import { useMedia } from "react-use";

export function useSlotsNavigation() {
  const isNarrowScreen = useMedia(narrowNavMedia);
  const [isNavCollapsed, setIsNavCollapsed] = useAtom(_isNavCollapsedAtom);
  const currentRoute = useCurrentRoute();

  const noNav = currentRoute === "Replay";
  const showOnlyEpochBar = currentRoute === "Schedule";

  const showNav = !noNav && (showOnlyEpochBar || !isNavCollapsed);

  return {
    noNav,
    isNarrowScreen,
    showNav,
    setIsNavCollapsed,
    showOnlyEpochBar,
    blurBackground:
      !noNav && isNarrowScreen && !isNavCollapsed && !showOnlyEpochBar,
    occupyRowWidth:
      !noNav && (showOnlyEpochBar || (!isNarrowScreen && !isNavCollapsed)),
  };
}
