export function photoReviewForUploader(role, userId, reviewedAt) {
  const autoApproved = role === "distributor";
  return {
    status: autoApproved ? "approved" : "pending",
    reviewedBy: autoApproved ? userId : null,
    reviewedAt: autoApproved ? reviewedAt : null,
    autoApproved,
  };
}
