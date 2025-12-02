import {
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from "@tanstack/react-router";
import { LeaderSchedule } from "../features/LeaderSchedule";
import { z } from "zod";

const SearchTypeSchema = z.enum(["mySlots", "skippedSlots", "text"]);
export const SearchTypeEnum = SearchTypeSchema.enum;
export type SearchType = z.infer<typeof SearchTypeSchema>;

const defaultValues = {
  searchType: SearchTypeEnum.text,
  searchText: "",
};

const searchParamsSchema = z.object({
  searchType: SearchTypeSchema.default(SearchTypeEnum.text).catch(
    SearchTypeEnum.text,
  ),
  searchText: z.string().default("").catch(""),
});

export const Route = createFileRoute("/leaderSchedule")({
  component: LeaderSchedule,
  validateSearch: searchParamsSchema,
  search: {
    middlewares: [
      stripSearchParams(defaultValues),
      retainSearchParams(["searchType", "searchText"]),
    ],
  },
});
