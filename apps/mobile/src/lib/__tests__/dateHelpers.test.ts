import { toDateInput, toTimeInput, parseMeasuredAt } from "../dateHelpers";

describe("toDateInput", () => {
  it("pads month and day to two digits", () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("formats a double-digit month and day unchanged", () => {
    expect(toDateInput(new Date(2026, 10, 23))).toBe("2026-11-23");
  });
});

describe("toTimeInput", () => {
  it("pads hour and minute to two digits, 24-hour format", () => {
    expect(toTimeInput(new Date(2026, 0, 1, 7, 5))).toBe("07:05");
  });

  it("formats afternoon times in 24-hour form", () => {
    expect(toTimeInput(new Date(2026, 0, 1, 15, 30))).toBe("15:30");
  });
});

describe("parseMeasuredAt", () => {
  it("parses a well-formed date and time", () => {
    const result = parseMeasuredAt("2026-08-06", "07:30");
    expect(result).not.toBeNull();
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(7); // 0-indexed
    expect(result?.getDate()).toBe(6);
    expect(result?.getHours()).toBe(7);
    expect(result?.getMinutes()).toBe(30);
  });

  it("rejects a malformed date shape", () => {
    expect(parseMeasuredAt("2026/08/06", "07:30")).toBeNull();
  });

  it("rejects a malformed time shape", () => {
    expect(parseMeasuredAt("2026-08-06", "7:30 AM")).toBeNull();
  });

  it("rejects a rolled-over invalid day (e.g. day 32) instead of silently normalizing it", () => {
    expect(parseMeasuredAt("2026-08-32", "07:30")).toBeNull();
  });

  it("rejects a rolled-over invalid month (e.g. month 13)", () => {
    expect(parseMeasuredAt("2026-13-01", "07:30")).toBeNull();
  });

  it("rejects an out-of-range hour", () => {
    expect(parseMeasuredAt("2026-08-06", "25:00")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    const result = parseMeasuredAt(" 2026-08-06 ", " 07:30 ");
    expect(result).not.toBeNull();
  });

  it("round-trips with toDateInput/toTimeInput", () => {
    const original = new Date(2026, 5, 15, 14, 45);
    const parsed = parseMeasuredAt(toDateInput(original), toTimeInput(original));
    expect(parsed?.getTime()).toBe(new Date(2026, 5, 15, 14, 45).getTime());
  });
});
