/**
 * Zod schemas for the mobile app's write-side forms (medications, BP
 * readings). These validate on submit, before the network call — they
 * don't replace the backend's own Pydantic validation (still the source
 * of truth), they just catch mistakes locally with a clearer message and
 * without a round trip.
 */

import { z } from "zod";

export const medicationSchema = z.object({
  medication_name: z
    .string()
    .trim()
    .min(1, "Medicine name is required.")
    .max(200, "Medicine name is too long."),
  dosage_description: z
    .string()
    .trim()
    .max(500, "Instructions are too long.")
    .optional()
    .or(z.literal("")),
  scheduled_time: z
    .string()
    .trim()
    .max(100, "Scheduled time is too long.")
    .optional()
    .or(z.literal("")),
  supply_status: z.enum(["adequate", "low", "out"]),
  reminder_enabled: z.boolean().default(true),
});

export type MedicationFormInput = z.infer<typeof medicationSchema>;

export const signUpSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name."),
  email: z.string().trim().min(3, "Enter a valid email.").email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  age: z
    .number({ invalid_type_error: "Enter a valid age." })
    .int()
    .min(0, "Enter a valid age.")
    .max(130, "Enter a valid age.")
    .optional(),
  contact_number: z.string().trim().max(30, "Contact number is too long.").optional().or(z.literal("")),
});

export const bpReadingSchema = z.object({
  systolic: z
    .number({ invalid_type_error: "Enter a systolic value." })
    .int()
    .min(40, "Systolic must be between 40 and 300.")
    .max(300, "Systolic must be between 40 and 300."),
  diastolic: z
    .number({ invalid_type_error: "Enter a diastolic value." })
    .int()
    .min(20, "Diastolic must be between 20 and 200.")
    .max(200, "Diastolic must be between 20 and 200."),
  pulse: z
    .number({ invalid_type_error: "Enter a valid pulse." })
    .int()
    .min(20, "Pulse must be between 20 and 250.")
    .max(250, "Pulse must be between 20 and 250.")
    .nullable()
    .optional(),
});

/**
 * Runs a zod schema and returns either the parsed data or the first
 * human-readable error message — the shape every screen's handleSave()
 * already expects (a single `error` string to show in its validation box).
 */
export function validateOrError<T>(
  schema: z.ZodType<T>,
  input: unknown
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Invalid input." };
}
