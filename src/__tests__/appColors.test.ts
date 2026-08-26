import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as colors from "../colors";
import { kebabCase } from "../utils";

describe("appColors.css", () => {
  it("matches colors.ts exactly (regenerate on palette changes)", () => {
    // vitest runs with the repo root as cwd (jsdom import.meta.url is http)
    const css = readFileSync(join(process.cwd(), "src/appColors.css"), "utf8");
    // whitespace/case/decimal-insensitive: prettier reflows long values,
    // lowercases hex literals and normalizes .5/0.50 to 0.5
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/\( /g, "(")
        .replace(/ \)/g, ")")
        .replace(/(^|[\s(,])\.(\d)/g, "$10.$2")
        .replace(/(\d*\.\d*?)0+(?=\D|$)/g, "$1")
        .replace(/(\d)\.(?=\D|$)/g, "$1")
        .trim();
    const block = css.slice(css.indexOf("{") + 1, css.lastIndexOf("}"));
    const declared: Record<string, string> = {};
    for (const decl of block.split(";")) {
      const idx = decl.indexOf(":");
      if (idx === -1) continue;
      declared[decl.slice(0, idx).trim()] = norm(decl.slice(idx + 1));
    }
    const expected = Object.fromEntries(
      Object.entries(colors).map(([name, value]) => [
        `--${kebabCase(name)}`,
        norm(value),
      ]),
    );
    expect(declared).toEqual(expected);
  });
});
