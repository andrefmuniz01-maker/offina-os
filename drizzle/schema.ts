import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const createdAt = timestamp("createdAt").defaultNow().notNull();
const updatedAt = timestamp("updatedAt").defaultNow().onUpdateNow().notNull();

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  platformRole: mysqlEnum("platformRole", ["platform_user", "super_admin"])
    .default("platform_user")
    .notNull(),
  createdAt,
  updatedAt,
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const plans = mysqlTable("plans", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  maxUsers: int("maxUsers").notNull().default(3),
  maxCustomers: int("maxCustomers"),
  features: json("features").$type<Record<string, boolean>>(),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("plans_code_unique").on(table.code)]);

export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 96 }).notNull(),
  status: mysqlEnum("status", ["trial", "active", "suspended", "inactive"])
    .default("trial")
    .notNull(),
  planId: int("planId").references(() => plans.id),
  primaryOwnerUserId: int("primaryOwnerUserId").references(() => users.id),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("tenants_slug_unique").on(table.slug), index("tenants_status_idx").on(table.status)]);

export const tenantSettings = mysqlTable("tenant_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  legalName: varchar("legalName", { length: 200 }),
  document: varchar("document", { length: 32 }),
  phone: varchar("phone", { length: 32 }),
  whatsapp: varchar("whatsapp", { length: 32 }),
  email: varchar("email", { length: 320 }),
  address: json("address").$type<Record<string, string>>(),
  openingHours: json("openingHours").$type<Record<string, string>>(),
  defaultLaborHourlyRate: decimal("defaultLaborHourlyRate", { precision: 12, scale: 2 }).notNull().default("0"),
  defaultPartsMarginPercent: decimal("defaultPartsMarginPercent", { precision: 7, scale: 2 }).notNull().default("0"),
  defaultPartsMarkupPercent: decimal("defaultPartsMarkupPercent", { precision: 7, scale: 2 }).notNull().default("0"),
  minimumMarginPercent: decimal("minimumMarginPercent", { precision: 7, scale: 2 }).notNull().default("0"),
  attendantMaxDiscountPercent: decimal("attendantMaxDiscountPercent", { precision: 7, scale: 2 }).notNull().default("0"),
  quoteValidityDays: int("quoteValidityDays").notNull().default(7),
  quoteMessageTemplate: text("quoteMessageTemplate"),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("tenant_settings_tenant_unique").on(table.tenantId)]);

export const tenantBranding = mysqlTable("tenant_branding", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 16 }).notNull().default("#E84D1C"),
  secondaryColor: varchar("secondaryColor", { length: 16 }).notNull().default("#171717"),
  accentColor: varchar("accentColor", { length: 16 }).notNull().default("#F5B33A"),
  publicTitle: varchar("publicTitle", { length: 160 }),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("tenant_branding_tenant_unique").on(table.tenantId)]);

export const tenantMembers = mysqlTable("tenant_members", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  userId: int("userId").notNull().references(() => users.id),
  role: mysqlEnum("role", ["owner", "admin", "attendant", "technician"])
    .notNull()
    .default("attendant"),
  permissions: json("permissions").$type<string[]>(),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex("tenant_members_tenant_user_unique").on(table.tenantId, table.userId),
  index("tenant_members_user_idx").on(table.userId),
]);

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  name: varchar("name", { length: 180 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  document: varchar("document", { length: 32 }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [index("customers_tenant_name_idx").on(table.tenantId, table.name), index("customers_tenant_phone_idx").on(table.tenantId, table.whatsapp)]);

export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  customerId: int("customerId").notNull().references(() => customers.id),
  make: varchar("make", { length: 100 }).notNull(),
  model: varchar("model", { length: 140 }).notNull(),
  modelYear: int("modelYear"),
  manufactureYear: int("manufactureYear"),
  plate: varchar("plate", { length: 16 }),
  mileage: int("mileage"),
  engine: varchar("engine", { length: 120 }),
  notes: text("notes"),
  createdAt,
  updatedAt,
}, (table) => [index("vehicles_tenant_customer_idx").on(table.tenantId, table.customerId), index("vehicles_tenant_plate_idx").on(table.tenantId, table.plate)]);

export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  name: varchar("name", { length: 180 }).notNull(),
  document: varchar("document", { length: 32 }),
  contactName: varchar("contactName", { length: 160 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [index("suppliers_tenant_name_idx").on(table.tenantId, table.name)]);

export const productCategories = mysqlTable("product_categories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("product_categories_tenant_name_unique").on(table.tenantId, table.name)]);

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  categoryId: int("categoryId").references(() => productCategories.id),
  supplierId: int("supplierId").references(() => suppliers.id),
  name: varchar("name", { length: 180 }).notNull(),
  sku: varchar("sku", { length: 96 }),
  brand: varchar("brand", { length: 100 }),
  unit: varchar("unit", { length: 16 }).notNull().default("un"),
  currentCost: decimal("currentCost", { precision: 12, scale: 2 }).notNull().default("0"),
  averageCost: decimal("averageCost", { precision: 12, scale: 2 }).notNull().default("0"),
  salePrice: decimal("salePrice", { precision: 12, scale: 2 }).notNull().default("0"),
  desiredMarginPercent: decimal("desiredMarginPercent", { precision: 7, scale: 2 }).notNull().default("0"),
  minStock: decimal("minStock", { precision: 12, scale: 3 }).notNull().default("0"),
  maxStock: decimal("maxStock", { precision: 12, scale: 3 }),
  location: varchar("location", { length: 120 }),
  barcode: varchar("barcode", { length: 96 }),
  imageUrl: text("imageUrl"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex("products_tenant_sku_unique").on(table.tenantId, table.sku),
  index("products_tenant_name_idx").on(table.tenantId, table.name),
  index("products_tenant_category_idx").on(table.tenantId, table.categoryId),
]);

export const inventoryBalances = mysqlTable("inventory_balances", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  productId: int("productId").notNull().references(() => products.id),
  physicalQuantity: decimal("physicalQuantity", { precision: 12, scale: 3 }).notNull().default("0"),
  reservedQuantity: decimal("reservedQuantity", { precision: 12, scale: 3 }).notNull().default("0"),
  updatedAt,
}, (table) => [uniqueIndex("inventory_balances_tenant_product_unique").on(table.tenantId, table.productId), index("inventory_balances_tenant_idx").on(table.tenantId)]);

export const serviceCategories = mysqlTable("service_categories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("service_categories_tenant_name_unique").on(table.tenantId, table.name)]);

export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  categoryId: int("categoryId").references(() => serviceCategories.id),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  estimatedMinutes: int("estimatedMinutes").notNull().default(60),
  laborPrice: decimal("laborPrice", { precision: 12, scale: 2 }).notNull().default("0"),
  estimatedCost: decimal("estimatedCost", { precision: 12, scale: 2 }).notNull().default("0"),
  desiredMarginPercent: decimal("desiredMarginPercent", { precision: 7, scale: 2 }).notNull().default("0"),
  quoteQuestions: json("quoteQuestions").$type<Array<{ id: string; label: string; required?: boolean; type?: string; options?: string[] }>>(),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [index("services_tenant_name_idx").on(table.tenantId, table.name), index("services_tenant_category_idx").on(table.tenantId, table.categoryId)]);

export const serviceProducts = mysqlTable("service_products", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  serviceId: int("serviceId").notNull().references(() => services.id),
  productId: int("productId").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
  required: boolean("required").notNull().default(true),
  createdAt,
}, (table) => [uniqueIndex("service_products_service_product_unique").on(table.serviceId, table.productId), index("service_products_tenant_service_idx").on(table.tenantId, table.serviceId)]);

export const kits = mysqlTable("kits", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  categoryId: int("categoryId").references(() => serviceCategories.id),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  salePriceOverride: decimal("salePriceOverride", { precision: 12, scale: 2 }),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [index("kits_tenant_name_idx").on(table.tenantId, table.name)]);

export const kitItems = mysqlTable("kit_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  kitId: int("kitId").notNull().references(() => kits.id),
  productId: int("productId").references(() => products.id),
  serviceId: int("serviceId").references(() => services.id),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
  createdAt,
}, (table) => [index("kit_items_tenant_kit_idx").on(table.tenantId, table.kitId)]);

export const quoteRequests = mysqlTable("quote_requests", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  number: int("number").notNull(),
  customerId: int("customerId").references(() => customers.id),
  vehicleId: int("vehicleId").references(() => vehicles.id),
  serviceId: int("serviceId").references(() => services.id),
  requesterName: varchar("requesterName", { length: 180 }).notNull(),
  requesterWhatsapp: varchar("requesterWhatsapp", { length: 32 }).notNull(),
  requesterEmail: varchar("requesterEmail", { length: 320 }),
  vehicleSnapshot: json("vehicleSnapshot").$type<Record<string, string | number | null>>(),
  serviceLabel: varchar("serviceLabel", { length: 180 }).notNull(),
  answers: json("answers").$type<Record<string, string | number | boolean>>(),
  description: text("description"),
  source: mysqlEnum("source", ["public_link", "manual", "whatsapp", "instagram", "other"]).notNull().default("public_link"),
  status: mysqlEnum("status", ["new", "in_analysis", "awaiting_information", "in_quoting", "ready", "sent", "approved", "rejected", "expired", "cancelled"])
    .notNull()
    .default("new"),
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("quote_requests_tenant_number_unique").on(table.tenantId, table.number), index("quote_requests_tenant_status_idx").on(table.tenantId, table.status)]);

export const quoteRequestEvents = mysqlTable("quote_request_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  quoteRequestId: int("quoteRequestId").notNull().references(() => quoteRequests.id),
  type: mysqlEnum("type", ["created", "status_changed", "assigned", "note_added", "quote_created"]).notNull(),
  actorUserId: int("actorUserId").references(() => users.id),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt,
}, (table) => [index("quote_request_events_tenant_request_idx").on(table.tenantId, table.quoteRequestId)]);

export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  quoteRequestId: int("quoteRequestId").references(() => quoteRequests.id),
  quoteId: int("quoteId"),
  workOrderId: int("workOrderId"),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  url: text("url").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
  createdAt,
}, (table) => [index("attachments_tenant_request_idx").on(table.tenantId, table.quoteRequestId), index("attachments_tenant_quote_idx").on(table.tenantId, table.quoteId), index("attachments_tenant_work_order_idx").on(table.tenantId, table.workOrderId)]);

export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  number: int("number").notNull(),
  quoteRequestId: int("quoteRequestId").references(() => quoteRequests.id),
  customerId: int("customerId").notNull().references(() => customers.id),
  vehicleId: int("vehicleId").notNull().references(() => vehicles.id),
  status: mysqlEnum("status", ["draft", "ready", "sent", "viewed", "approved", "rejected", "expired", "cancelled"])
    .notNull()
    .default("draft"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  discountTotal: decimal("discountTotal", { precision: 12, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
  estimatedCostTotal: decimal("estimatedCostTotal", { precision: 12, scale: 2 }).notNull().default("0"),
  estimatedMarginPercent: decimal("estimatedMarginPercent", { precision: 7, scale: 2 }).notNull().default("0"),
  validUntil: timestamp("validUntil").notNull(),
  publicToken: varchar("publicToken", { length: 96 }).notNull(),
  publicTokenExpiresAt: timestamp("publicTokenExpiresAt").notNull(),
  notes: text("notes"),
  terms: text("terms"),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  sentAt: timestamp("sentAt"),
  viewedAt: timestamp("viewedAt"),
  approvedAt: timestamp("approvedAt"),
  rejectedAt: timestamp("rejectedAt"),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex("quotes_tenant_number_unique").on(table.tenantId, table.number),
  uniqueIndex("quotes_public_token_unique").on(table.publicToken),
  index("quotes_tenant_status_idx").on(table.tenantId, table.status),
]);

export const quoteItems = mysqlTable("quote_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  quoteId: int("quoteId").notNull().references(() => quotes.id),
  productId: int("productId").references(() => products.id),
  serviceId: int("serviceId").references(() => services.id),
  kitId: int("kitId").references(() => kits.id),
  itemType: mysqlEnum("itemType", ["product", "service", "kit", "custom"]).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull().default("0"),
  discount: decimal("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt,
}, (table) => [index("quote_items_tenant_quote_idx").on(table.tenantId, table.quoteId)]);

export const quoteEvents = mysqlTable("quote_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  quoteId: int("quoteId").notNull().references(() => quotes.id),
  type: mysqlEnum("type", ["created", "sent", "viewed", "approved", "rejected", "expired", "cancelled", "message_prepared"])
    .notNull(),
  actorUserId: int("actorUserId").references(() => users.id),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt,
}, (table) => [index("quote_events_tenant_quote_idx").on(table.tenantId, table.quoteId)]);

export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  quoteId: int("quoteId").references(() => quotes.id),
  customerId: int("customerId").notNull().references(() => customers.id),
  vehicleId: int("vehicleId").notNull().references(() => vehicles.id),
  workOrderId: int("workOrderId"),
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  bay: varchar("bay", { length: 80 }),
  scheduledStart: timestamp("scheduledStart").notNull(),
  scheduledEnd: timestamp("scheduledEnd").notNull(),
  status: mysqlEnum("status", ["scheduled", "confirmed", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service", "completed", "delivered", "cancelled"])
    .notNull()
    .default("scheduled"),
  notes: text("notes"),
  createdAt,
  updatedAt,
}, (table) => [index("appointments_tenant_start_idx").on(table.tenantId, table.scheduledStart), index("appointments_tenant_status_idx").on(table.tenantId, table.status)]);

export const workOrders = mysqlTable("work_orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  number: int("number").notNull(),
  quoteId: int("quoteId").references(() => quotes.id),
  appointmentId: int("appointmentId").references(() => appointments.id),
  customerId: int("customerId").notNull().references(() => customers.id),
  vehicleId: int("vehicleId").notNull().references(() => vehicles.id),
  status: mysqlEnum("status", ["scheduled", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service", "completed", "delivered", "cancelled"])
    .notNull()
    .default("scheduled"),
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  estimatedTotal: decimal("estimatedTotal", { precision: 12, scale: 2 }).notNull().default("0"),
  estimatedCostTotal: decimal("estimatedCostTotal", { precision: 12, scale: 2 }).notNull().default("0"),
  realCostTotal: decimal("realCostTotal", { precision: 12, scale: 2 }).notNull().default("0"),
  realMarginPercent: decimal("realMarginPercent", { precision: 7, scale: 2 }).notNull().default("0"),
  warrantyDays: int("warrantyDays"),
  notes: text("notes"),
  completedAt: timestamp("completedAt"),
  deliveredAt: timestamp("deliveredAt"),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("work_orders_tenant_number_unique").on(table.tenantId, table.number), index("work_orders_tenant_status_idx").on(table.tenantId, table.status)]);

export const workOrderItems = mysqlTable("work_order_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  workOrderId: int("workOrderId").notNull().references(() => workOrders.id),
  productId: int("productId").references(() => products.id),
  serviceId: int("serviceId").references(() => services.id),
  description: varchar("description", { length: 255 }).notNull(),
  itemType: mysqlEnum("itemType", ["product", "service", "custom"]).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull().default("0"),
  expectedUnitCost: decimal("expectedUnitCost", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt,
}, (table) => [index("work_order_items_tenant_order_idx").on(table.tenantId, table.workOrderId)]);

export const workOrderChecklists = mysqlTable("work_order_checklists", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  workOrderId: int("workOrderId").notNull().references(() => workOrders.id),
  label: varchar("label", { length: 200 }).notNull(),
  completed: boolean("completed").notNull().default(false),
  completedByUserId: int("completedByUserId").references(() => users.id),
  completedAt: timestamp("completedAt"),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt,
}, (table) => [index("work_order_checklists_tenant_order_idx").on(table.tenantId, table.workOrderId)]);

export const workOrderNotes = mysqlTable("work_order_notes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  workOrderId: int("workOrderId").notNull().references(() => workOrders.id),
  authorUserId: int("authorUserId").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt,
}, (table) => [index("work_order_notes_tenant_order_idx").on(table.tenantId, table.workOrderId)]);

export const inventoryReservations = mysqlTable("inventory_reservations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  productId: int("productId").notNull().references(() => products.id),
  quoteId: int("quoteId").references(() => quotes.id),
  workOrderId: int("workOrderId").references(() => workOrders.id),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  status: mysqlEnum("status", ["active", "consumed", "released"]).notNull().default("active"),
  createdAt,
  releasedAt: timestamp("releasedAt"),
}, (table) => [index("inventory_reservations_tenant_product_idx").on(table.tenantId, table.productId), index("inventory_reservations_tenant_quote_idx").on(table.tenantId, table.quoteId)]);

export const workOrderConsumption = mysqlTable("work_order_consumption", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  workOrderId: int("workOrderId").notNull().references(() => workOrders.id),
  productId: int("productId").notNull().references(() => products.id),
  reservationId: int("reservationId").references(() => inventoryReservations.id),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull(),
  consumedByUserId: int("consumedByUserId").references(() => users.id),
  createdAt,
}, (table) => [index("work_order_consumption_tenant_order_idx").on(table.tenantId, table.workOrderId)]);

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  productId: int("productId").notNull().references(() => products.id),
  type: mysqlEnum("type", ["purchase_entry", "reservation", "reservation_release", "consumption", "adjustment", "return"])
    .notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  physicalDelta: decimal("physicalDelta", { precision: 12, scale: 3 }).notNull().default("0"),
  reservedDelta: decimal("reservedDelta", { precision: 12, scale: 3 }).notNull().default("0"),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: int("referenceId"),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").references(() => users.id),
  createdAt,
}, (table) => [index("inventory_movements_tenant_product_date_idx").on(table.tenantId, table.productId, table.createdAt)]);

export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  number: int("number").notNull(),
  supplierId: int("supplierId").references(() => suppliers.id),
  status: mysqlEnum("status", ["draft", "ordered", "partially_received", "received", "cancelled"])
    .notNull()
    .default("draft"),
  orderedAt: timestamp("orderedAt"),
  receivedAt: timestamp("receivedAt"),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("purchase_orders_tenant_number_unique").on(table.tenantId, table.number), index("purchase_orders_tenant_status_idx").on(table.tenantId, table.status)]);

export const purchaseOrderItems = mysqlTable("purchase_order_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  purchaseOrderId: int("purchaseOrderId").notNull().references(() => purchaseOrders.id),
  productId: int("productId").notNull().references(() => products.id),
  orderedQuantity: decimal("orderedQuantity", { precision: 12, scale: 3 }).notNull(),
  receivedQuantity: decimal("receivedQuantity", { precision: 12, scale: 3 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull(),
  createdAt,
}, (table) => [index("purchase_order_items_tenant_order_idx").on(table.tenantId, table.purchaseOrderId)]);

export const revenues = mysqlTable("revenues", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  workOrderId: int("workOrderId").references(() => workOrders.id),
  customerId: int("customerId").references(() => customers.id),
  vehicleId: int("vehicleId").references(() => vehicles.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar("paymentMethod", { length: 64 }),
  status: mysqlEnum("status", ["expected", "received", "cancelled"]).notNull().default("expected"),
  dueAt: timestamp("dueAt"),
  receivedAt: timestamp("receivedAt"),
  notes: text("notes"),
  createdAt,
  updatedAt,
}, (table) => [index("revenues_tenant_status_date_idx").on(table.tenantId, table.status, table.receivedAt)]);

export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  category: varchar("category", { length: 96 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["planned", "paid", "cancelled"]).notNull().default("planned"),
  expenseDate: timestamp("expenseDate").notNull(),
  dueAt: timestamp("dueAt"),
  recurrence: varchar("recurrence", { length: 32 }),
  supplierId: int("supplierId").references(() => suppliers.id),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt,
  updatedAt,
}, (table) => [index("expenses_tenant_status_date_idx").on(table.tenantId, table.status, table.expenseDate)]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  userId: int("userId").references(() => users.id),
  customerId: int("customerId").references(() => customers.id),
  vehicleId: int("vehicleId").references(() => vehicles.id),
  workOrderId: int("workOrderId").references(() => workOrders.id),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  link: varchar("link", { length: 500 }),
  readAt: timestamp("readAt"),
  createdAt,
}, (table) => [index("notifications_tenant_user_read_idx").on(table.tenantId, table.userId, table.readAt), index("notifications_tenant_customer_idx").on(table.tenantId, table.customerId), index("notifications_tenant_vehicle_idx").on(table.tenantId, table.vehicleId)]);

export const notificationPreferences = mysqlTable("notification_preferences", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  userId: int("userId").notNull().references(() => users.id),
  inAppEnabled: boolean("inAppEnabled").notNull().default(true),
  emailEnabled: boolean("emailEnabled").notNull().default(false),
  enabledTypes: json("enabledTypes").$type<string[]>(),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("notification_preferences_tenant_user_unique").on(table.tenantId, table.userId)]);

export const scheduledTasks = mysqlTable("scheduled_tasks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  key: varchar("key", { length: 96 }).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  cronExpression: varchar("cronExpression", { length: 64 }),
  active: boolean("active").notNull().default(false),
  lastRunAt: timestamp("lastRunAt"),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex("scheduled_tasks_tenant_key_unique").on(table.tenantId, table.key), index("scheduled_tasks_uid_idx").on(table.scheduleCronTaskUid)]);

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  actorUserId: int("actorUserId").references(() => users.id),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entityType", { length: 96 }).notNull(),
  entityId: int("entityId"),
  before: json("before").$type<Record<string, unknown>>(),
  after: json("after").$type<Record<string, unknown>>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt,
}, (table) => [index("audit_logs_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId), index("audit_logs_actor_date_idx").on(table.actorUserId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type TenantMember = typeof tenantMembers.$inferSelect;
