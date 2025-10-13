import { narrowNavMedia } from "../consts";
import { useCurrentRoute } from "./useCurrentRoute";
import { useAtom } from "jotai";
import { _isNavCollapsedAtom } from "../atoms";
import { useMedia } from "react-use";

export function useSlotsNavigation() {
  const isNarrowScreen = useMedia(narrowNavMedia);
  const [isNavCollapsed, setIsNavCollapsed] = useAtom(_isNavCollapsedAtom);
  const isLeaderSchedule = useCurrentRoute() === "Schedule";

  const showNav = isLeaderSchedule || !isNavCollapsed;
  const showOnlyEpochBar = isLeaderSchedule;

  return {
    isNarrowScreen,
    showNav,
    setIsNavCollapsed,
    showOnlyEpochBar,
    blurBackground: isNarrowScreen && !isNavCollapsed && !showOnlyEpochBar,
    occupyRowWidth: showOnlyEpochBar || (!isNarrowScreen && !isNavCollapsed),
  };
}
