import { describe, expect, test } from "bun:test";
import { accountPreferencesSchema, deleteAccountConfirmationSchema, profileSettingsSchema } from "./account-settings.validation";

describe("account settings validation", () => {
  test("trims and accepts a valid profile", () => {
    expect(profileSettingsSchema.parse({ fullName: "  Rosi Bezara ", phone: " +261 34 " })).toEqual({
      fullName: "Rosi Bezara",
      phone: "+261 34"
    });
  });

  test("rejects short names and oversized phone numbers", () => {
    expect(profileSettingsSchema.safeParse({ fullName: "A", phone: "1".repeat(41) }).success).toBe(false);
  });

  test("accepts only known preferences and boolean notification switches", () => {
    const valid = {
      language: "Français",
      theme: "Sombre",
      notifications: { email: true, push: false, outageAlerts: true, maintenanceReminders: true, monthlyReports: false },
      security: { twoFactor: false, sessionTimeout: true }
    };
    expect(accountPreferencesSchema.safeParse(valid).success).toBe(true);
    expect(accountPreferencesSchema.safeParse({ ...valid, notifications: { ...valid.notifications, email: "yes" } }).success).toBe(false);
    expect(accountPreferencesSchema.safeParse({ ...valid, theme: "neon" }).success).toBe(false);
  });

  test("requires a valid email to confirm account deletion", () => {
    expect(deleteAccountConfirmationSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(deleteAccountConfirmationSchema.safeParse({ email: "user@example.com" }).success).toBe(true);
  });
});
