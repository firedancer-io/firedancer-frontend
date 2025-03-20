import {
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from "@tanstack/react-router";
import { LeaderSchedule } from "../features/LeaderSchedule";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";

const SearchTypeSchema = z.enum(["mySlots", "skippedSlots", "text"]);
export const SearchTypeEnum = SearchTypeSchema.enum;
export type SearchType = z.infer<typeof SearchTypeSchema>;

const defaultValues = {
  searchType: SearchTypeEnum.text,
  searchText: "",
};

const searchParamsSchema = z.object({
  searchType: fallback(SearchTypeSchema, SearchTypeEnum.text).default(
    SearchTypeEnum.text
  ),
  searchText: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/leaderSchedule")({
  component: LeaderSchedule,
  validateSearch: zodValidator(searchParamsSchema),
  search: {
    middlewares: [
      stripSearchParams(defaultValues),
      retainSearchParams(["searchType", "searchText"]),
    ],
  },
});
