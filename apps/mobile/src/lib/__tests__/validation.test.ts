import { medicationSchema, bpReadingSchema, validateOrError } from "../validation";

describe("medicationSchema", () => {
  it("accepts a valid medication", () => {
    const result = validateOrError(medicationSchema, {
      medication_name: "Amlodipine 5mg",
      dosage_description: "One tablet every morning",
      scheduled_time: "8:00 AM",
      supply_status: "adequate",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts an empty optional dosage_description and scheduled_time", () => {
    const result = validateOrError(medicationSchema, {
      medication_name: "Amlodipine 5mg",
      dosage_description: "",
      scheduled_time: "",
      supply_status: "adequate",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an empty medicine name", () => {
    const result = validateOrError(medicationSchema, {
      medication_name: "",
      dosage_description: "",
      scheduled_time: "",
      supply_status: "adequate",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/name is required/i);
  });

  it("rejects an invalid supply_status", () => {
    const result = validateOrError(medicationSchema, {
      medication_name: "Amlodipine 5mg",
      dosage_description: "",
      scheduled_time: "",
      supply_status: "expired",
    });
    expect(result.ok).toBe(false);
  });
});

describe("bpReadingSchema", () => {
  it("accepts values within range", () => {
    const result = validateOrError(bpReadingSchema, { systolic: 120, diastolic: 80 });
    expect(result.ok).toBe(true);
  });

  it("rejects NaN (e.g. an empty text field converted to a number)", () => {
    const result = validateOrError(bpReadingSchema, { systolic: NaN, diastolic: 80 });
    expect(result.ok).toBe(false);
  });

  it("rejects a systolic value below the plausible range", () => {
    const result = validateOrError(bpReadingSchema, { systolic: 10, diastolic: 80 });
    expect(result.ok).toBe(false);
  });

  it("rejects a diastolic value above the plausible range", () => {
    const result = validateOrError(bpReadingSchema, { systolic: 120, diastolic: 250 });
    expect(result.ok).toBe(false);
  });
});
