import { AnySQLiteColumn, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  language: text("language", { enum: ["es", "it", "en"] }).notNull().default("es"),
  role: text("role", { enum: ["super_admin", "admin", "sales_manager", "sales", "distributor"] }).notNull(),
  island: text("island"),
  salesManagerId: text("sales_manager_id").references((): AnySQLiteColumn => users.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  passwordIterations: integer("password_iterations"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  passwordChangedAt: text("password_changed_at"),
  totpSecretEncrypted: text("totp_secret_encrypted"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("users_email_unique").on(table.email),
  index("users_role_idx").on(table.role),
  index("users_sales_manager_idx").on(table.salesManagerId),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);

export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose", { enum: ["login", "contract_sign"] }).notNull(),
  subjectId: text("subject_id"),
  codeHash: text("code_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  requestedByUserId: text("requested_by_user_id").references(() => users.id),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("auth_challenges_lookup_idx").on(table.email, table.purpose, table.expiresAt)]);

export const authFlowTokens = sqliteTable("auth_flow_tokens", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  purpose: text("purpose", { enum: ["change_password", "password_reset", "totp_setup", "totp_login", "email_change"] }).notNull(),
  dataJson: text("data_json"),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("auth_flow_tokens_hash_unique").on(table.tokenHash), index("auth_flow_tokens_user_idx").on(table.userId, table.purpose, table.expiresAt)]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  blockedUntil: text("blocked_until"),
});

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  taxId: text("tax_id"),
  fiscalAddress: text("fiscal_address"),
  billingEmail: text("billing_email"),
  legalSignerName: text("legal_signer_name"),
  legalSignerRole: text("legal_signer_role"),
  island: text("island").notNull(),
  stage: text("stage", { enum: ["lead", "qualified", "proposal", "standby", "won", "lost"] }).notNull().default("lead"),
  valueCents: integer("value_cents").notNull().default(0),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
}, (table) => [index("clients_owner_idx").on(table.ownerUserId), index("clients_island_idx").on(table.island), index("clients_stage_idx").on(table.stage)]);

export const landingLeads = sqliteTable("landing_leads", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  contact: text("contact").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  city: text("city").notNull(),
  island: text("island").notNull(),
  service: text("service", { enum: ["magazine", "podcast", "both"] }).notNull(),
  notes: text("notes").notNull().default(""),
  locale: text("locale", { enum: ["es", "it", "en"] }).notNull().default("es"),
  source: text("source").notNull().default("crmvlc_landing"),
  status: text("status", { enum: ["pending_manager", "assigned"] }).notNull().default("pending_manager"),
  assignedManagerId: text("assigned_manager_id").references(() => users.id),
  clientId: text("client_id").references(() => clients.id),
  consentAt: text("consent_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("landing_leads_island_status_idx").on(table.island, table.status),
  index("landing_leads_manager_idx").on(table.assignedManagerId, table.createdAt),
  index("landing_leads_email_idx").on(table.email, table.createdAt),
]);

export const deliveries = sqliteTable("deliveries", {
  id: text("id").primaryKey(),
  clientId: text("client_id").references(() => clients.id),
  distributorUserId: text("distributor_user_id").notNull().references(() => users.id),
  distributionPointId: text("distribution_point_id").references(() => distributionPoints.id),
  island: text("island").notNull(),
  status: text("status", { enum: ["assigned", "in_progress", "delivered", "issue"] }).notNull().default("assigned"),
  quantity: integer("quantity").notNull().default(1),
  unit: text("unit").notNull().default("copie"),
  scheduledFor: text("scheduled_for"),
  deliveryContactName: text("delivery_contact_name"),
  deliveryContactEmail: text("delivery_contact_email"),
  deliveryContactPhone: text("delivery_contact_phone"),
  deliveryAddress: text("delivery_address"),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => users.id),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("deliveries_distributor_idx").on(table.distributorUserId),
  index("deliveries_island_idx").on(table.island),
  index("deliveries_status_idx").on(table.status),
  index("deliveries_client_idx").on(table.clientId),
  index("deliveries_distribution_point_idx").on(table.distributionPointId),
]);

export const contractTemplates = sqliteTable("contract_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  r2Key: text("r2_key").notNull(),
  mimeType: text("mime_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
}, (table) => [index("contract_templates_active_idx").on(table.active)]);

export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  quoteId: text("quote_id"),
  templateId: text("template_id").references(() => contractTemplates.id),
  title: text("title").notNull(),
  status: text("status", { enum: ["draft", "awaiting_signature", "signed", "cancelled"] }).notNull().default("draft"),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  island: text("island").notNull(),
  signerName: text("signer_name"),
  signerEmail: text("signer_email"),
  draftR2Key: text("draft_r2_key").notNull(),
  signedR2Key: text("signed_r2_key"),
  signatureR2Key: text("signature_r2_key"),
  evidenceR2Key: text("evidence_r2_key"),
  documentSha256: text("document_sha256").notNull(),
  contractDataJson: text("contract_data_json"),
  signedDocumentSha256: text("signed_document_sha256"),
  signatureSha256: text("signature_sha256"),
  version: integer("version").notNull().default(1),
  parentContractId: text("parent_contract_id"),
  cancelledReason: text("cancelled_reason"),
  cancelledAt: text("cancelled_at"),
  cancelledBy: text("cancelled_by").references(() => users.id),
  signedAt: text("signed_at"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("contracts_quote_unique").on(table.quoteId),
  index("contracts_owner_idx").on(table.ownerUserId),
  index("contracts_island_idx").on(table.island),
  index("contracts_status_idx").on(table.status),
  index("contracts_client_idx").on(table.clientId),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payloadJson: text("payload_json").notNull(),
  payloadSha256: text("payload_sha256").notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("audit_entity_idx").on(table.entityType, table.entityId), index("audit_created_idx").on(table.createdAt)]);

export const emailOutbox = sqliteTable("email_outbox", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["contract_receipt"] }).notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  attachmentR2Key: text("attachment_r2_key"),
  attachmentFilename: text("attachment_filename"),
  status: text("status", { enum: ["pending", "sent", "dead"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("next_attempt_at").notNull(),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
}, (table) => [index("email_outbox_pending_idx").on(table.status, table.nextAttemptAt)]);

export const r2DeletionQueue = sqliteTable("r2_deletion_queue", {
  r2Key: text("r2_key").primaryKey(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
});

export const priceLists = sqliteTable("price_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  currency: text("currency").notNull().default("EUR"),
  taxName: text("tax_name").notNull().default("IGIC"),
  taxRateBps: integer("tax_rate_bps").notNull().default(700),
  pricesIncludeTax: integer("prices_include_tax", { mode: "boolean" }).notNull().default(false),
  validFrom: text("valid_from"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("price_lists_active_idx").on(table.active)]);

export const priceItems = sqliteTable("price_items", {
  id: text("id").primaryKey(),
  priceListId: text("price_list_id").notNull().references(() => priceLists.id),
  code: text("code").notNull(),
  category: text("category", { enum: ["cover", "internal_high", "internal_low", "back_cover"] }).notNull(),
  name: text("name").notNull(),
  dimensions: text("dimensions").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  includedServices: text("included_services"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("price_items_code_unique").on(table.code),
  index("price_items_list_idx").on(table.priceListId, table.active, table.sortOrder),
]);

export const discountCampaigns = sqliteTable("discount_campaigns", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  discountBps: integer("discount_bps").notNull(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  deactivatedAt: text("deactivated_at"),
  deactivatedBy: text("deactivated_by").references(() => users.id),
}, (table) => [
  index("discount_campaigns_validity_idx").on(table.active, table.startsOn, table.endsOn),
  index("discount_campaigns_created_idx").on(table.createdAt),
]);

export const quoteCounters = sqliteTable("quote_counters", {
  year: integer("year").primaryKey(),
  nextNumber: integer("next_number").notNull(),
});

export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  quoteNumber: text("quote_number").notNull(),
  sequence: integer("sequence").notNull(),
  year: integer("year").notNull(),
  clientId: text("client_id").notNull().references(() => clients.id),
  priceListId: text("price_list_id").notNull().references(() => priceLists.id),
  status: text("status", { enum: ["issued", "converted"] }).notNull().default("issued"),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  island: text("island").notNull(),
  customerCompany: text("customer_company").notNull(),
  customerContact: text("customer_contact").notNull(),
  customerEmail: text("customer_email").notNull(),
  currency: text("currency").notNull().default("EUR"),
  taxName: text("tax_name").notNull().default("IGIC"),
  taxRateBps: integer("tax_rate_bps").notNull().default(700),
  months: integer("months").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountCampaignId: text("discount_campaign_id").references(() => discountCampaigns.id),
  discountBps: integer("discount_bps").notNull().default(0),
  discountReason: text("discount_reason"),
  discountCents: integer("discount_cents").notNull().default(0),
  netCents: integer("net_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  customerNote: text("customer_note"),
  validUntil: text("valid_until").notNull(),
  pdfR2Key: text("pdf_r2_key").notNull(),
  pdfSha256: text("pdf_sha256").notNull(),
  convertedContractId: text("converted_contract_id"),
  convertedAt: text("converted_at"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("quotes_number_unique").on(table.quoteNumber),
  index("quotes_owner_idx").on(table.ownerUserId),
  index("quotes_island_idx").on(table.island),
  index("quotes_client_idx").on(table.clientId),
  index("quotes_discount_campaign_idx").on(table.discountCampaignId),
  index("quotes_status_idx").on(table.status),
  index("quotes_created_idx").on(table.createdAt),
]);

export const quoteItems = sqliteTable("quote_items", {
  id: text("id").primaryKey(),
  quoteId: text("quote_id").notNull().references(() => quotes.id),
  priceItemId: text("price_item_id").notNull().references(() => priceItems.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  dimensions: text("dimensions").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  quantity: integer("quantity").notNull(),
  months: integer("months").notNull(),
  lineSubtotalCents: integer("line_subtotal_cents").notNull(),
}, (table) => [index("quote_items_quote_idx").on(table.quoteId)]);

export const podcastAppointments = sqliteTable("podcast_appointments", {
  id: text("id").primaryKey(),
  guestName: text("guest_name").notNull(),
  topic: text("topic").notNull(),
  interviewerUserId: text("interviewer_user_id").notNull().references(() => users.id),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  notes: text("notes"),
  packageCode: text("package_code", { enum: ["one_minute_free", "three_to_five_minutes"] }).notNull().default("one_minute_free"),
  packageName: text("package_name").notNull().default("1 minuto · 1 telecamera"),
  packagePriceCents: integer("package_price_cents").notNull().default(0),
  marcolifestyleAddOn: integer("marcolifestyle_add_on", { mode: "boolean" }).notNull().default(false),
  marcolifestylePriceCents: integer("marcolifestyle_price_cents").notNull().default(0),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxName: text("tax_name").notNull().default("IGIC"),
  taxRateBps: integer("tax_rate_bps").notNull().default(700),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  status: text("status", { enum: ["scheduled", "cancelled"] }).notNull().default("scheduled"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("podcast_appointments_interviewer_idx").on(table.interviewerUserId, table.startsAt, table.endsAt),
  index("podcast_appointments_calendar_idx").on(table.status, table.startsAt),
]);

export const sponsors = sqliteTable("sponsors", {
  id: text("id").primaryKey(),
  clientId: text("client_id").references(() => clients.id),
  name: text("name").notNull(),
  island: text("island").notNull(),
  category: text("category").notNull(),
  status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
  offerTitle: text("offer_title").notNull(),
  discountText: text("discount_text").notNull(),
  merchantPinHash: text("merchant_pin_hash").notNull(),
  address: text("address"),
  latitude: integer("latitude_e6"),
  longitude: integer("longitude_e6"),
  instagramHandle: text("instagram_handle"),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("sponsors_island_idx").on(table.island), index("sponsors_owner_idx").on(table.ownerUserId)]);

export const vipMembers = sqliteTable("vip_members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  island: text("island").notNull(),
  tier: text("tier", { enum: ["standard", "platinum"] }).notNull().default("standard"),
  streakMonths: integer("streak_months").notNull().default(0),
  consentAt: text("consent_at").notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("vip_members_phone_unique").on(table.phone), index("vip_members_island_idx").on(table.island), index("vip_members_created_by_idx").on(table.createdByUserId)]);

export const coupons = sqliteTable("coupons", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => vipMembers.id),
  sponsorId: text("sponsor_id").notNull().references(() => sponsors.id),
  code: text("code").notNull(),
  status: text("status", { enum: ["issued", "redeemed", "expired"] }).notNull().default("issued"),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  redeemedAt: text("redeemed_at"),
  redeemedByUserId: text("redeemed_by_user_id").references(() => users.id),
  latitude: integer("latitude_e6"),
  longitude: integer("longitude_e6"),
  whatsappSentAt: text("whatsapp_sent_at"),
  whatsappMessageId: text("whatsapp_message_id"),
}, (table) => [uniqueIndex("coupons_code_unique").on(table.code), index("coupons_sponsor_idx").on(table.sponsorId, table.status), index("coupons_member_idx").on(table.memberId)]);

export const vipEvents = sqliteTable("vip_events", {
  id: text("id").primaryKey(),
  memberId: text("member_id").references(() => vipMembers.id),
  sponsorId: text("sponsor_id").references(() => sponsors.id),
  eventType: text("event_type", { enum: ["directory_view", "sponsor_view", "registration", "coupon_issued", "instagram_click"] }).notNull(),
  island: text("island"),
  visitorHash: text("visitor_hash"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("vip_events_sponsor_idx").on(table.sponsorId, table.eventType, table.createdAt), index("vip_events_member_idx").on(table.memberId, table.createdAt)]);

export const publicRateLimits = sqliteTable("public_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
}, (table) => [index("public_rate_limits_expiry_idx").on(table.expiresAt)]);

export const commissionRules = sqliteTable("commission_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["sales_manager", "sales", "distributor"] }).notNull(),
  island: text("island"),
  rateBps: integer("rate_bps").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("commission_rules_scope_idx").on(table.role, table.island, table.active)]);

export const walletEntries = sqliteTable("wallet_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["pending", "available", "paid"] }).notNull().default("pending"),
  availableAt: text("available_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("wallet_entries_user_idx").on(table.userId, table.status, table.createdAt)]);

export const payoutRequests = sqliteTable("payout_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["requested", "approved", "paid", "rejected"] }).notNull().default("requested"),
  note: text("note"),
  reviewedBy: text("reviewed_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("payout_requests_user_idx").on(table.userId, table.status, table.createdAt)]);

export const adInventory = sqliteTable("ad_inventory", {
  id: text("id").primaryKey(),
  issueLabel: text("issue_label").notNull(),
  island: text("island").notNull(),
  slotCode: text("slot_code").notNull(),
  slotName: text("slot_name").notNull(),
  widthMm: integer("width_mm").notNull(),
  heightMm: integer("height_mm").notNull(),
  priceItemId: text("price_item_id").references(() => priceItems.id),
  status: text("status", { enum: ["available", "held", "sold"] }).notNull().default("available"),
  clientId: text("client_id").references(() => clients.id),
  contractId: text("contract_id").references(() => contracts.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("ad_inventory_issue_slot_unique").on(table.issueLabel, table.island, table.slotCode), index("ad_inventory_status_idx").on(table.island, table.status)]);

export const distributionPoints = sqliteTable("distribution_points", {
  id: text("id").primaryKey(),
  clientId: text("client_id").references(() => clients.id),
  name: text("name").notNull(),
  island: text("island").notNull(),
  address: text("address").notNull(),
  latitude: integer("latitude_e6").notNull(),
  longitude: integer("longitude_e6").notNull(),
  capacity: integer("capacity").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  publicVisible: integer("public_visible", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").references(() => users.id),
  selfRegistered: integer("self_registered", { mode: "boolean" }).notNull().default(false),
  pointPhotoR2Key: text("point_photo_r2_key"),
  nextCheckDueAt: text("next_check_due_at"),
  area: text("area"),
  locationStatus: text("location_status", { enum: ["pending", "complete"] }).notNull().default("complete"),
  assignedDistributorUserId: text("assigned_distributor_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("distribution_points_island_idx").on(table.island, table.publicVisible),
  index("distribution_points_created_by_idx").on(table.createdBy),
  index("distribution_points_next_check_due_idx").on(table.nextCheckDueAt),
  index("distribution_points_location_status_idx").on(table.locationStatus, table.island),
  index("distribution_points_assigned_distributor_idx").on(table.assignedDistributorUserId, table.locationStatus),
]);

export const photoAudits = sqliteTable("photo_audits", {
  id: text("id").primaryKey(),
  deliveryId: text("delivery_id").notNull().references(() => deliveries.id),
  distributorUserId: text("distributor_user_id").notNull().references(() => users.id),
  island: text("island").notNull(),
  r2Key: text("r2_key").notNull(),
  sha256: text("sha256").notNull(),
  latitude: integer("latitude_e6").notNull(),
  longitude: integer("longitude_e6").notNull(),
  geofenceDistanceM: integer("geofence_distance_m"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  qualityScore: integer("quality_score").notNull().default(0),
  duplicateOfAuditId: text("duplicate_of_audit_id"),
  aiModel: text("ai_model"),
  aiVerdict: text("ai_verdict"),
  aiResultJson: text("ai_result_json"),
  watermarkText: text("watermark_text").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
  reviewedAt: text("reviewed_at"),
}, (table) => [index("photo_audits_delivery_idx").on(table.deliveryId), index("photo_audits_scope_idx").on(table.island, table.status)]);

export const deliveryChecks = sqliteTable("delivery_checks", {
  id: text("id").primaryKey(),
  distributionPointId: text("distribution_point_id").notNull().references(() => distributionPoints.id),
  deliveryId: text("delivery_id").references(() => deliveries.id),
  distributorUserId: text("distributor_user_id").notNull().references(() => users.id),
  island: text("island").notNull(),
  quantityLeft: integer("quantity_left").notNull(),
  quantityFound: integer("quantity_found").notNull(),
  quantityTaken: integer("quantity_taken").notNull(),
  r2Key: text("r2_key").notNull(),
  latitude: integer("latitude_e6").notNull(),
  longitude: integer("longitude_e6").notNull(),
  geofenceDistanceM: integer("geofence_distance_m"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("delivery_checks_point_idx").on(table.distributionPointId),
  index("delivery_checks_distributor_idx").on(table.distributorUserId),
  index("delivery_checks_delivery_idx").on(table.deliveryId),
]);

export const salesCheckins = sqliteTable("sales_checkins", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  island: text("island").notNull(),
  latitude: integer("latitude_e6").notNull(),
  longitude: integer("longitude_e6").notNull(),
  checkedInAt: text("checked_in_at").notNull(),
  status: text("status", { enum: ["on_time", "late", "outside_geofence"] }).notNull(),
}, (table) => [index("sales_checkins_user_idx").on(table.userId, table.checkedInAt), index("sales_checkins_island_idx").on(table.island, table.checkedInAt)]);

export const salesTasks = sqliteTable("sales_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  clientId: text("client_id").references(() => clients.id),
  island: text("island").notNull(),
  kind: text("kind", { enum: ["visit", "display_check"] }).notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ["open", "completed", "cancelled"] }).notNull().default("open"),
  scheduledFor: text("scheduled_for").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("sales_tasks_user_idx").on(table.userId, table.status, table.scheduledFor), index("sales_tasks_island_idx").on(table.island, table.status)]);

export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("bundles_code_unique").on(table.code)]);

export const faqEntries = sqliteTable("faq_entries", {
  id: text("id").primaryKey(),
  translationGroupId: text("translation_group_id").notNull(),
  language: text("language", { enum: ["es", "it", "en"] }).notNull(),
  moduleKey: text("module_key").notNull(),
  title: text("title").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  allowedRolesJson: text("allowed_roles_json").notNull(),
  status: text("status", { enum: ["draft", "published", "retired"] }).notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),
  approvedBy: text("approved_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
}, (table) => [
  uniqueIndex("faq_entries_version_unique").on(table.translationGroupId, table.language, table.version),
  index("faq_entries_published_idx").on(table.status, table.language, table.moduleKey),
]);

export const aiInteractions = sqliteTable("ai_interactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
  island: text("island"),
  language: text("language", { enum: ["es", "it", "en"] }).notNull(),
  moduleKey: text("module_key").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  status: text("status", { enum: ["answered", "escalated", "budget_blocked", "error"] }).notNull(),
  sourcesJson: text("sources_json").notNull().default("[]"),
  model: text("model"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  estimatedCostMicroUsd: integer("estimated_cost_micro_usd").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [index("ai_interactions_user_idx").on(table.userId, table.createdAt), index("ai_interactions_status_idx").on(table.status, table.createdAt)]);

export const faqTickets = sqliteTable("faq_tickets", {
  id: text("id").primaryKey(),
  interactionId: text("interaction_id").notNull().references(() => aiInteractions.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
  island: text("island"),
  language: text("language", { enum: ["es", "it", "en"] }).notNull(),
  moduleKey: text("module_key").notNull(),
  question: text("question").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
}, (table) => [index("faq_tickets_queue_idx").on(table.status, table.createdAt), index("faq_tickets_user_idx").on(table.userId, table.createdAt)]);

export const aiMonthlyUsage = sqliteTable("ai_monthly_usage", {
  monthKey: text("month_key").primaryKey(),
  spentMicroUsd: integer("spent_micro_usd").notNull().default(0),
  reservedMicroUsd: integer("reserved_micro_usd").notNull().default(0),
  requestCount: integer("request_count").notNull().default(0),
  budgetMicroUsd: integer("budget_micro_usd").notNull().default(25000000),
  updatedAt: text("updated_at").notNull(),
});

