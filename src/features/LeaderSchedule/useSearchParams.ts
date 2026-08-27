import { navigate, useLeaderScheduleSearch } from "../../router";
import type { SearchType } from "../../routes/-searchValidators";
import { SearchTypeEnum } from "../../routes/-searchValidators";
import { useCallback } from "react";

export function useSearchTypeSearchParam() {
  const { searchType } = useLeaderScheduleSearch();

  const setSearchType = useCallback((searchType: SearchType) => {
    navigate({
      to: "/leaderSchedule",
      search: { searchType },
      replace: true,
    });
  }, []);

  return { searchType, setSearchType };
}

export function useSearchTextSearchParam() {
  const { searchText } = useLeaderScheduleSearch();

  const setSearchText = useCallback((searchText: string) => {
    navigate({
      to: "/leaderSchedule",
      search: { searchText, searchType: SearchTypeEnum.text },
      replace: true,
    });
  }, []);

  return { searchText, setSearchText };
}
