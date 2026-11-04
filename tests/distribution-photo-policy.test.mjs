import assert from "node:assert/strict";
import test from "node:test";
import { photoReviewForUploader } from "../worker/distribution-photo-policy.js";

test("auto-approves photos uploaded by a distributor", () => {
  assert.deepEqual(photoReviewForUploader("distributor", "driver-1", "2026-11-04T10:00:00.000Z"), {
    status: "approved",
    reviewedBy: "driver-1",
    reviewedAt: "2026-11-04T10:00:00.000Z",
    autoApproved: true,
  });
});

test("keeps managerial uploads pending for explicit review", () => {
  for (const role of ["super_admin", "admin", "sales_manager", "sales"]) {
    assert.deepEqual(photoReviewForUploader(role, "operator-1", "2026-11-04T10:00:00.000Z"), {
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      autoApproved: false,
    });
  }
});
