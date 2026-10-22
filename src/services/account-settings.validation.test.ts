import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accountPreferencesSchema, deleteAccountConfirmationSchema, profileSettingsSchema } from "./account-settings.validation";

describe("account settings validation", () => {
  it("trims and accepts a valid profile", () => {
    assert.deepEqual(profileSettingsSchema.parse({ fullName: "  Rosi Bezara ", phone: " +261 34 " }), {
      fullName: "Rosi Bezara",
      phone: "+261 34"
    });
  });

  it("rejects short names and oversized phone numbers", () => {
    assert.equal(profileSettingsSchema.safeParse({ fullName: "A", phone: "1".repeat(41) }).success, false);
  });

  it("accepts only known preferences and boolean notification switches", () => {
    const valid = {
      language: "Français",
      theme: "Sombre",
      notifications: { email: true, push: false, outageAlerts: true, maintenanceReminders: true, monthlyReports: false },
      security: { twoFactor: false, sessionTimeout: true }
    };
    assert.equal(accountPreferencesSchema.safeParse(valid).success, true);
    assert.equal(accountPreferencesSchema.safeParse({ ...valid, notifications: { ...valid.notifications, email: "yes" } }).success, false);
    assert.equal(accountPreferencesSchema.safeParse({ ...valid, theme: "neon" }).success, false);
  });

  it("requires a valid email to confirm account deletion", () => {
    assert.equal(deleteAccountConfirmationSchema.safeParse({ email: "not-an-email" }).success, false);
    assert.equal(deleteAccountConfirmationSchema.safeParse({ email: "user@example.com" }).success, true);
  });
});
