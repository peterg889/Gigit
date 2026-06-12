import { describe, expect, it } from "vitest";
import { nextOccurrences, patternFromFirst } from "./recurrence.js";

describe("patternFromFirst", () => {
  it("derives weekly pattern", () => {
    // Fri 2026-06-19 20:00 UTC
    const p = patternFromFirst(new Date("2026-06-19T20:00:00Z"), 120, "weekly");
    expect(p).toEqual({
      freq: "weekly",
      dayOfWeek: 5,
      startTimeUtc: "20:00",
      durationMinutes: 120,
    });
  });

  it("derives monthly Nth-weekday pattern", () => {
    // 2026-06-02 is the first Tuesday
    const p = patternFromFirst(new Date("2026-06-02T19:00:00Z"), 90, "monthly_dow");
    expect(p).toEqual({
      freq: "monthly_dow",
      dayOfWeek: 2,
      week: 1,
      startTimeUtc: "19:00",
      durationMinutes: 90,
    });
  });
});

describe("nextOccurrences weekly", () => {
  const p = patternFromFirst(new Date("2026-06-19T20:00:00Z"), 120, "weekly");
  it("returns consecutive Fridays after the anchor", () => {
    const occ = nextOccurrences(p, new Date("2026-06-12T00:00:00Z"), 3);
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-06-12T20:00:00.000Z",
      "2026-06-19T20:00:00.000Z",
      "2026-06-26T20:00:00.000Z",
    ]);
  });
  it("is strictly after `after` (same-day boundary)", () => {
    const occ = nextOccurrences(p, new Date("2026-06-12T20:00:00Z"), 1);
    expect(occ[0].toISOString()).toBe("2026-06-19T20:00:00.000Z");
  });
});

describe("nextOccurrences monthly_dow", () => {
  it("first Tuesday of each month", () => {
    const p = patternFromFirst(new Date("2026-06-02T19:00:00Z"), 90, "monthly_dow");
    const occ = nextOccurrences(p, new Date("2026-06-12T00:00:00Z"), 3);
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-07-07T19:00:00.000Z",
      "2026-08-04T19:00:00.000Z",
      "2026-09-01T19:00:00.000Z",
    ]);
  });
  it("last Friday (week 5 = last)", () => {
    const occ = nextOccurrences(
      { freq: "monthly_dow", dayOfWeek: 5, week: 5, startTimeUtc: "21:00", durationMinutes: 60 },
      new Date("2026-06-01T00:00:00Z"),
      2,
    );
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-06-26T21:00:00.000Z",
      "2026-07-31T21:00:00.000Z",
    ]);
  });
});
