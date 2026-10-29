import { z } from "zod";

export const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  startDate: z.date({
    error: "Start date is required",
  }),
  endDate: z.date({
    error: "End date is required",
  }),
  color: z.enum(["blue", "green", "red", "yellow", "purple", "orange"], {
    error: "Variant is required",
  }),
});

export type TEventFormData = z.infer<typeof eventSchema>;
