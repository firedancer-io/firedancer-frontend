import type { SearchSchemaInput } from "@tanstack/react-router";

export const SearchTypeEnum = {
  mySlots: "mySlots",
  skippedSlots: "skippedSlots",
  lateVoteSlots: "lateVoteSlots",
  text: "text",
} as const;
export type SearchType = (typeof SearchTypeEnum)[keyof typeof SearchTypeEnum];

const searchTypes: ReadonlySet<unknown> = new Set(
  Object.values(SearchTypeEnum),
);

// Hand-rolled stand-ins for the zod/mini schemas these routes used to
// pass to validateSearch (every field catches/defaults, so they are
// total over object inputs), keeping the zod core out of the main
// bundle; equivalence, including key-presence and inherited-key lookup,
// is locked down by src/__tests__/validateSearch.test.ts

export function validateLeaderScheduleSearch(
  search: Record<string, unknown> & SearchSchemaInput,
): { searchType: SearchType; searchText: string } {
  const { searchType, searchText } = search;
  return {
    searchType: searchTypes.has(searchType)
      ? (searchType as SearchType)
      : SearchTypeEnum.text,
    searchText: typeof searchText === "string" ? searchText : "",
  };
}

export function validateSlotDetailsSearch(
  search: Record<string, unknown> & SearchSchemaInput,
): { slot?: number | undefined } {
  if (!("slot" in search)) return {};
  const { slot } = search;
  return {
    slot: typeof slot === "number" && Number.isFinite(slot) ? slot : undefined,
  };
}
