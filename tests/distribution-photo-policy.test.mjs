import assert from "node:assert/strict";
import test from "node:test";
import { photoReviewForUploader } from "../worker/distribution-photo-policy.js";

test("auto-approves every photo, whoever uploads it", () => {
  for (const role of ["distributor", "super_admin", "admin", "sales_manager", "sales"]) {
    assert.deepEqual(photoReviewForUploader(role, "user-1", "2026-11-04T10:00:00.000Z"), {
      status: "approved",
      reviewedBy: "user-1",
      reviewedAt: "2026-11-04T10:00:00.000Z",
      autoApproved: true,
    });
  }
});
