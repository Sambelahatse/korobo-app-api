import { z } from "zod";

export const profileSettingsSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).nullable().optional()
});

export const accountPreferencesSchema = z.object({
  language: z.enum(["Français", "English", "Malagasy"]).default("Français"),
  theme: z.enum(["Clair", "Sombre", "Système"]).default("Clair"),
  notifications: z.object({
    email: z.boolean(),
    push: z.boolean(),
    outageAlerts: z.boolean(),
    maintenanceReminders: z.boolean(),
    monthlyReports: z.boolean()
  }),
  security: z.object({
    twoFactor: z.boolean(),
    sessionTimeout: z.boolean()
  })
});

export const deleteAccountConfirmationSchema = z.object({
  email: z.string().trim().email().max(254),
  currentPassword: z.string().max(128).optional()
});
