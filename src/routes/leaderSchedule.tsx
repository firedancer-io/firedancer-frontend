import {
  createFileRoute,
  redirect,
  retainSearchParams,
  stripSearchParams,
} from "@tanstack/react-router";
import {
  SearchTypeEnum,
  validateLeaderScheduleSearch,
} from "./-searchValidators";

export { SearchTypeEnum } from "./-searchValidators";
export type { SearchType } from "./-searchValidators";

const defaultValues = {
  searchType: SearchTypeEnum.text,
  searchText: "",
};

export const Route = createFileRoute("/leaderSchedule")({
  validateSearch: validateLeaderScheduleSearch,
  search: {
    middlewares: [
      stripSearchParams(defaultValues),
      retainSearchParams(["searchType", "searchText"]),
    ],
  },
  beforeLoad: ({ search }) => {
    if (!search.searchText.includes(";")) return;

    // Replace ; with , for backwards compatibility
    throw redirect({
      to: "/leaderSchedule",
      search: {
        ...search,
        searchText: search.searchText.replaceAll(";", ","),
      },
    });
  },
});
