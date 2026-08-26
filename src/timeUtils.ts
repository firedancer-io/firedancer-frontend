// Minimal luxon-compatible Duration/DateTime covering exactly the API this
// app uses, backed by native Date/Intl. Behavior is pinned to luxon by
// comparison tests in src/__tests__/timeUtils.test.ts.

const unitAliases = {
  year: "years",
  years: "years",
  quarter: "quarters",
  quarters: "quarters",
  month: "months",
  months: "months",
  week: "weeks",
  weeks: "weeks",
  day: "days",
  days: "days",
  hour: "hours",
  hours: "hours",
  minute: "minutes",
  minutes: "minutes",
  second: "seconds",
  seconds: "seconds",
  millisecond: "milliseconds",
  milliseconds: "milliseconds",
} as const;

export type DurationUnit = (typeof unitAliases)[keyof typeof unitAliases];
export type DurationObject = Partial<Record<keyof typeof unitAliases, number>>;

// luxon's casual conversion matrix, expressed as ms per unit
const msPerUnit: Record<DurationUnit, number> = {
  years: 365 * 86_400_000,
  quarters: 91 * 86_400_000,
  months: 30 * 86_400_000,
  weeks: 7 * 86_400_000,
  days: 86_400_000,
  hours: 3_600_000,
  minutes: 60_000,
  seconds: 1_000,
  milliseconds: 1,
};

// rescale() rollup chain: ms->s->min->h->d->w->mo->y (luxon's shiftToAll
// has no quarters)
const rescaleChain: [DurationUnit, number][] = [
  ["seconds", 1_000],
  ["minutes", 60],
  ["hours", 60],
  ["days", 24],
  ["weeks", 7],
  ["months", 4],
  ["years", 12],
];

type DurationValues = Partial<Record<DurationUnit, number>>;

export class Duration {
  private constructor(readonly values: DurationValues) {}

  static fromMillis(ms: number) {
    return new Duration({ milliseconds: ms });
  }

  static fromObject(obj: DurationObject) {
    const values: DurationValues = {};
    for (const key in obj) {
      const unit = unitAliases[key as keyof typeof unitAliases];
      const value = obj[key as keyof typeof unitAliases];
      if (unit && value !== undefined) values[unit] = value;
    }
    return new Duration(values);
  }

  toMillis() {
    let ms = 0;
    for (const unit in this.values) {
      ms +=
        (this.values[unit as DurationUnit] ?? 0) *
        msPerUnit[unit as DurationUnit];
    }
    return ms;
  }

  as(unit: DurationUnit) {
    return this.toMillis() / msPerUnit[unit];
  }

  rescale() {
    const totalMs = this.toMillis();
    const sign = totalMs < 0 ? -1 : 1;
    const absMs = Math.abs(totalMs);
    // sub-ms fraction stays on milliseconds, as in luxon
    const fraction = absMs % 1;
    let carry = absMs - fraction;
    const values: DurationValues = {};
    let unit: DurationUnit = "milliseconds";
    for (const [nextUnit, factor] of rescaleChain) {
      let value = carry % factor;
      carry = (carry - value) / factor;
      if (unit === "milliseconds") value += fraction;
      if (value !== 0) values[unit] = sign * value;
      unit = nextUnit;
    }
    if (carry !== 0) values[unit] = sign * carry;
    return new Duration(values);
  }

  get years() {
    return this.values.years ?? 0;
  }
  get quarters() {
    return this.values.quarters ?? 0;
  }
  get months() {
    return this.values.months ?? 0;
  }
  get weeks() {
    return this.values.weeks ?? 0;
  }
  get days() {
    return this.values.days ?? 0;
  }
  get hours() {
    return this.values.hours ?? 0;
  }
  get minutes() {
    return this.values.minutes ?? 0;
  }
  get seconds() {
    return this.values.seconds ?? 0;
  }
  get milliseconds() {
    return this.values.milliseconds ?? 0;
  }
}

const localeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function pad(n: number, len: number) {
  return String(n).padStart(len, "0");
}

export class DateTime {
  private constructor(private readonly ts: number) {}

  static readonly DATETIME_MED_WITH_SECONDS: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  };

  static now() {
    return new DateTime(Date.now());
  }

  static fromMillis(ms: number) {
    return new DateTime(ms);
  }

  toMillis() {
    return this.ts;
  }

  toSeconds() {
    return this.ts / 1_000;
  }

  valueOf() {
    return this.ts;
  }

  diff(other: DateTime) {
    return Duration.fromMillis(this.ts - other.ts);
  }

  plus(duration: Duration) {
    const v = duration.values;
    const calMonths =
      (v.years ?? 0) * 12 + (v.quarters ?? 0) * 3 + (v.months ?? 0);
    const calDays = (v.weeks ?? 0) * 7 + (v.days ?? 0);
    let ts = this.ts;
    if (calMonths || calDays) {
      const d = new Date(ts);
      const y = d.getFullYear();
      const mo = d.getMonth() + calMonths;
      // clamp day-of-month after the month shift, as luxon does
      const daysInTargetMonth = new Date(y, mo + 1, 0).getDate();
      const day = Math.min(d.getDate(), daysInTargetMonth) + calDays;
      ts = new Date(
        y,
        mo,
        day,
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
        d.getMilliseconds(),
      ).getTime();
    }
    ts +=
      (v.hours ?? 0) * 3_600_000 +
      (v.minutes ?? 0) * 60_000 +
      (v.seconds ?? 0) * 1_000 +
      (v.milliseconds ?? 0);
    return new DateTime(ts);
  }

  toString() {
    return new Date(this.ts).toISOString();
  }

  toISO(_options?: { includeOffset?: boolean }): string | null {
    const d = new Date(this.ts);
    if (isNaN(d.getTime())) return null;
    return (
      `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}` +
      `T${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}` +
      `.${pad(d.getMilliseconds(), 3)}`
    );
  }

  toLocaleString(options: Intl.DateTimeFormatOptions) {
    const key = JSON.stringify(options);
    let formatter = localeFormatterCache.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(undefined, options);
      localeFormatterCache.set(key, formatter);
    }
    return formatter.format(new Date(this.ts));
  }
}
