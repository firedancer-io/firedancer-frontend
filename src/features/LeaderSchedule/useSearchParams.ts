import { useNavigate } from "@tanstack/react-router";
import type { SearchType } from "../../routes/leaderSchedule";
import { Route, SearchTypeEnum } from "../../routes/leaderSchedule";
import { useCallback } from "react";

export function useSearchTypeSearchParam() {
  const { searchType } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearchType = useCallback(
    (searchType: SearchType) => {
      void navigate({ search: { searchType }, replace: true });
    },
    [navigate],
  );

  return { searchType, setSearchType };
}

export function useSearchTextSearchParam() {
  const { searchText } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearchText = useCallback(
    (searchText: string) => {
      void navigate({
        search: { searchText, searchType: SearchTypeEnum.text },
        replace: true,
      });
    },
    [navigate],
  );

  return { searchText, setSearchText };
}
