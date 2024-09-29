import { ZodType } from "zod";

export function safeParseJson<T>(schema: ZodType<T>, jsonValue: string | null) {
  if (jsonValue) return schema.safeParse(JSON.parse(jsonValue));
}
