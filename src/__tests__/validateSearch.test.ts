// Differential proof that the hand-rolled validateSearch functions match
// the zod/mini schemas they replaced (kept here test-only so no zod core
// lands in the main bundle).  The router always calls validateSearch with
// the parsed search params object, so equivalence is asserted over object
// inputs (Record<string, unknown>), the router's contract.
import type { SearchSchemaInput } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import {
  SearchTypeEnum,
  validateLeaderScheduleSearch as validateLeaderScheduleSearchBranded,
  validateSlotDetailsSearch as validateSlotDetailsSearchBranded,
} from "../routes/-searchValidators";

// SearchSchemaInput is a type-level brand the router applies to search
// inputs; erase it so plain objects can be passed in tests
const validateLeaderScheduleSearch = (search: Record<string, unknown>) =>
  validateLeaderScheduleSearchBranded(
    search as Record<string, unknown> & SearchSchemaInput,
  );
const validateSlotDetailsSearch = (search: Record<string, unknown>) =>
  validateSlotDetailsSearchBranded(
    search as Record<string, unknown> & SearchSchemaInput,
  );

// The exact schemas the routes used before the hand-rolled swap.
const leaderScheduleZodSchema = z.object({
  searchType: z.catch(
    z._default(z.enum(SearchTypeEnum), SearchTypeEnum.text),
    SearchTypeEnum.text,
  ),
  searchText: z.catch(z._default(z.string(), ""), ""),
});

const slotDetailsZodSchema = z.object({
  slot: z.catch(z.optional(z.number()), undefined),
});

// Sentinel meaning "key absent from the input object".
const MISSING = Symbol("missing");

function buildInput(fields: Record<string, unknown>, extras?: object) {
  const input: Record<string, unknown> = { ...extras };
  for (const [key, value] of Object.entries(fields))
    if (value !== MISSING) input[key] = value;
  return input;
}

const nonStringValues = [
  null,
  0,
  -1,
  5,
  5.5,
  NaN,
  Infinity,
  -Infinity,
  true,
  false,
  {},
  { a: 1 },
  [],
  ["text"],
  5n,
  Symbol("s"),
  new Date(0),
  () => "text",
];

const extrasVariants = [undefined, { extra: 1, nested: { a: [2] } }];

describe("leaderSchedule validateSearch", () => {
  const searchTypeInputs = [
    MISSING,
    undefined,
    ...Object.values(SearchTypeEnum),
    "",
    "Text",
    "TEXT",
    " mySlots",
    "mySlots ",
    "myslots",
    "toString",
    "constructor",
    "__proto__",
    "hasOwnProperty",
    ...nonStringValues,
  ];
  const searchTextInputs = [
    MISSING,
    undefined,
    "",
    "abc",
    "a,b;c",
    "0",
    "mySlots",
    " ",
    "x".repeat(4096),
    ...nonStringValues,
  ];

  it("matches the zod/mini schema over the full case matrix", () => {
    for (const searchType of searchTypeInputs)
      for (const searchText of searchTextInputs)
        for (const extras of extrasVariants) {
          const input = buildInput({ searchType, searchText }, extras);
          expect(validateLeaderScheduleSearch(input)).toStrictEqual(
            leaderScheduleZodSchema.parse(input),
          );
        }
  });

  it("defaults both fields when absent, undefined, or invalid", () => {
    const defaults = { searchType: SearchTypeEnum.text, searchText: "" };
    expect(validateLeaderScheduleSearch({})).toStrictEqual(defaults);
    expect(
      validateLeaderScheduleSearch({
        searchType: undefined,
        searchText: undefined,
      }),
    ).toStrictEqual(defaults);
    expect(
      validateLeaderScheduleSearch({ searchType: "nope", searchText: 5 }),
    ).toStrictEqual(defaults);
  });

  it("passes valid values through and strips extra keys", () => {
    expect(
      validateLeaderScheduleSearch({
        searchType: "mySlots",
        searchText: "a,b",
        extra: true,
      }),
    ).toStrictEqual({ searchType: "mySlots", searchText: "a,b" });
  });

  it("does not treat Object.prototype keys as enum members", () => {
    expect(
      validateLeaderScheduleSearch({ searchType: "toString" }).searchType,
    ).toBe(SearchTypeEnum.text);
  });
});

describe("slotDetails validateSearch", () => {
  const slotInputs = [
    MISSING,
    undefined,
    0,
    -0,
    5,
    -3,
    5.5,
    -5.5,
    1e308,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_VALUE,
    NaN,
    Infinity,
    -Infinity,
    "5",
    "",
    ...nonStringValues.filter((v) => typeof v !== "number"),
  ];

  it("matches the zod/mini schema over the full case matrix", () => {
    for (const slot of slotInputs)
      for (const extras of extrasVariants) {
        const input = buildInput({ slot }, extras);
        expect(validateSlotDetailsSearch(input)).toStrictEqual(
          slotDetailsZodSchema.parse(input),
        );
      }
  });

  it("omits the key when absent but keeps it (as undefined) when present", () => {
    // zod only emits the key when the input has it; toStrictEqual alone
    // does not distinguish {} from { slot: undefined }
    expect(Object.keys(validateSlotDetailsSearch({}))).toStrictEqual([]);
    expect(
      Object.keys(validateSlotDetailsSearch({ slot: undefined })),
    ).toStrictEqual(["slot"]);
    expect(Object.keys(validateSlotDetailsSearch({ slot: "x" }))).toStrictEqual(
      ["slot"],
    );
  });

  it("sees inherited keys, like zod's `in`-based lookup", () => {
    const inherited = Object.create({ slot: 42 }) as Record<string, unknown>;
    expect(validateSlotDetailsSearch(inherited)).toStrictEqual(
      slotDetailsZodSchema.parse(inherited),
    );
    expect(validateSlotDetailsSearch(inherited)).toStrictEqual({ slot: 42 });
  });

  it("accepts finite numbers only, preserving -0", () => {
    expect(validateSlotDetailsSearch({ slot: 12345 })).toStrictEqual({
      slot: 12345,
    });
    expect(Object.is(validateSlotDetailsSearch({ slot: -0 }).slot, -0)).toBe(
      true,
    );
    for (const bad of [NaN, Infinity, -Infinity, "5", null, true])
      expect(validateSlotDetailsSearch({ slot: bad })).toStrictEqual({
        slot: undefined,
      });
  });
});
