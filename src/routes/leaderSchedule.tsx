import {
  createFileRoute,
  redirect,
  retainSearchParams,
  stripSearchParams,
} from "@tanstack/react-router";
// zod/mini so only the checks used here land in the main bundle; the
// classic zod runtime stays out of it (worker-only)
import * as z from "zod/mini";

export const SearchTypeEnum = {
  mySlots: "mySlots",
  skippedSlots: "skippedSlots",
  lateVoteSlots: "lateVoteSlots",
  text: "text",
} as const;
export type SearchType = (typeof SearchTypeEnum)[keyof typeof SearchTypeEnum];

const defaultValues = {
  searchType: SearchTypeEnum.text,
  searchText: "",
};

const searchParamsSchema = z.object({
  searchType: z.catch(
    z._default(z.enum(SearchTypeEnum), SearchTypeEnum.text),
    SearchTypeEnum.text,
  ),
  searchText: z.catch(z._default(z.string(), ""), ""),
});

export const Route = createFileRoute("/leaderSchedule")({
  validateSearch: searchParamsSchema,
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
