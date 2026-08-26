import "dotenv/config";

import { and, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  customers,
  inventoryBalances,
  productCategories,
  products,
  quoteRequestEvents,
  quoteRequests,
  serviceCategories,
  serviceProducts,
  services,
  suppliers,
  tenantBranding,
  tenantMembers,
  tenantSettings,
  tenants,
  users,
  vehicles,
} from "../drizzle/schema";
import { getDb } from "./db";

const DEMO_SLUG = "performance-garage";
const DEMO_NAME = "Performance Garage";
const DEMO_OPEN_IDS = {
  owner: "demo:performance-garage:owner",
  attendant: "demo:performance-garage:attendant",
  technician: "demo:performance-garage:technician",
} as const;

const money = (value: number) => value.toFixed(2);

async function getOrCreateUser(db: any, openId: string, name: string, email: string) {
  const existing = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
  if (existing) return existing.id as number;
  const result = await db.insert(users).values({
    openId,
    name,
    email,
    loginMethod: "demo-seed",
    role: "user",
    platformRole: "platform_user",
  });
  return Number(result[0].insertId);
}

export async function seedDemoTenant() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL é obrigatório para executar o seed da demonstração.");

  return db.transaction(async (tx) => {
    const ownerUserId = await getOrCreateUser(tx, DEMO_OPEN_IDS.owner, "Rafael Martins", "dono@performancedemo.com");
    const attendantUserId = await getOrCreateUser(tx, DEMO_OPEN_IDS.attendant, "Camila Souza", "atendimento@performancedemo.com");
    const technicianUserId = await getOrCreateUser(tx, DEMO_OPEN_IDS.technician, "Carlos Henrique", "mecanico@performancedemo.com");

    const existingTenant = (await tx.select().from(tenants).where(eq(tenants.slug, DEMO_SLUG)).limit(1))[0];
    let tenantId: number;
    if (existingTenant) {
      tenantId = existingTenant.id;
      await tx.update(tenants).set({ name: DEMO_NAME, status: "active", active: true, isDemo: true, primaryOwnerUserId: ownerUserId }).where(eq(tenants.id, tenantId));
    } else {
      const result = await tx.insert(tenants).values({
        name: DEMO_NAME,
        slug: DEMO_SLUG,
        status: "active",
        active: true,
        isDemo: true,
        primaryOwnerUserId: ownerUserId,
      });
      tenantId = Number(result[0].insertId);
    }

    await tx.insert(tenantSettings).values({
      tenantId,
      legalName: "Performance Garage — Ambiente Demonstrativo",
      phone: "(11) 4000-2026",
      whatsapp: "551140002026",
      email: "contato@performancedemo.com",
      address: { street: "Avenida das Oficinas", number: "820", neighborhood: "Vila Industrial", city: "São Paulo", state: "SP", zip: "04500-000" },
      openingHours: { monday: "08:00–18:00", tuesday: "08:00–18:00", wednesday: "08:00–18:00", thursday: "08:00–18:00", friday: "08:00–18:00", saturday: "08:00–13:00" },
      defaultLaborHourlyRate: money(180),
      defaultPartsMarginPercent: money(32),
      defaultPartsMarkupPercent: money(47),
      minimumMarginPercent: money(20),
      attendantMaxDiscountPercent: money(8),
      quoteValidityDays: 7,
      quoteMessageTemplate: "Olá, {cliente}. Seu orçamento da Performance Garage está pronto para revisão.",
    }).onDuplicateKeyUpdate({ set: { legalName: "Performance Garage — Ambiente Demonstrativo", phone: "(11) 4000-2026", whatsapp: "551140002026", email: "contato@performancedemo.com", address: { street: "Avenida das Oficinas", number: "820", neighborhood: "Vila Industrial", city: "São Paulo", state: "SP", zip: "04500-000" }, openingHours: { monday: "08:00–18:00", saturday: "08:00–13:00" } } });
    await tx.insert(tenantBranding).values({ tenantId, publicTitle: "Performance Garage | Oficina Automotiva & Performance", primaryColor: "#E85D2A", secondaryColor: "#151A22", accentColor: "#F4B942" }).onDuplicateKeyUpdate({ set: { publicTitle: "Performance Garage | Oficina Automotiva & Performance", primaryColor: "#E85D2A", secondaryColor: "#151A22", accentColor: "#F4B942" } });

    for (const [userId, role] of [[ownerUserId, "owner"], [attendantUserId, "attendant"], [technicianUserId, "technician"]] as const) {
      await tx.insert(tenantMembers).values({ tenantId, userId, role, active: true }).onDuplicateKeyUpdate({ set: { role, active: true } });
    }

    const categoryNames = ["Downpipe", "Catback", "Abafadores", "Ponteiras", "Juntas e Abraçadeiras", "Tubulações", "Intakes"];
    const categoryIds = new Map<string, number>();
    for (const name of categoryNames) {
      const current = (await tx.select().from(productCategories).where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.name, name))).limit(1))[0];
      if (current) categoryIds.set(name, current.id);
      else {
        const result = await tx.insert(productCategories).values({ tenantId, name, description: `Linha ${name} da Performance Garage.` });
        categoryIds.set(name, Number(result[0].insertId));
      }
    }

    const supplierNames = ["Performance Parts Brasil", "Escape Tech", "Inox Motors", "Turbo Parts", "Motors Supply"];
    const supplierIds = new Map<string, number>();
    for (const name of supplierNames) {
      const current = (await tx.select().from(suppliers).where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.name, name))).limit(1))[0];
      if (current) supplierIds.set(name, current.id);
      else {
        const result = await tx.insert(suppliers).values({ tenantId, name, contactName: "Equipe Comercial", phone: "(11) 3333-2026", email: `comercial@${name.toLowerCase().replaceAll(" ", "-")}.example` });
        supplierIds.set(name, Number(result[0].insertId));
      }
    }

    const productSeeds = [
      ["Downpipe BMW 320i", "DP-BMW-320", "Downpipe", 980, 1490, 8, 2],
      ["Downpipe Golf GTI", "DP-GOLF-GTI", "Downpipe", 1050, 1590, 4, 2],
      ["Catback BMW 320i", "CB-BMW-320", "Catback", 1850, 2890, 2, 1],
      ["Abafador Esportivo Inox 3\"", "ABF-INOX-3", "Abafadores", 420, 690, 5, 6],
      ["Abafador Performance X", "ABF-PERF-X", "Abafadores", 280, 520, 18, 3],
      ["Ponteira Inox 3\"", "PON-INOX-3", "Ponteiras", 110, 190, 6, 4],
      ["Junta 3\"", "JNT-3", "Juntas e Abraçadeiras", 42, 60, 12, 5],
      ["Abraçadeira 3\"", "ABR-3", "Juntas e Abraçadeiras", 28, 35, 20, 8],
      ["Tubo Inox 3\"", "TUB-INOX-3", "Tubulações", 260, 420, 3, 3],
      ["Intake BMW 320i", "INT-BMW-320", "Intakes", 730, 1190, 0, 1],
    ] as const;
    const productIds = new Map<string, number>();
    for (const [name, sku, category, currentCost, salePrice, stock, minStock] of productSeeds) {
      const current = (await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.sku, sku))).limit(1))[0];
      let productId: number;
      if (current) productId = current.id;
      else {
        const result = await tx.insert(products).values({ tenantId, categoryId: categoryIds.get(category), supplierId: supplierIds.get("Performance Parts Brasil"), name, sku, brand: "Performance Garage", currentCost: money(currentCost), averageCost: money(currentCost), salePrice: money(salePrice), desiredMarginPercent: money(((salePrice - currentCost) / salePrice) * 100), minStock: money(minStock), maxStock: money(Math.max(minStock * 3, stock)), location: `Estante ${category.slice(0, 3).toUpperCase()}`, description: `Item demonstrativo de catálogo: ${name}.` });
        productId = Number(result[0].insertId);
      }
      productIds.set(sku, productId);
      await tx.insert(inventoryBalances).values({ tenantId, productId, physicalQuantity: money(stock), reservedQuantity: sku === "ABF-INOX-3" ? money(2) : money(0) }).onDuplicateKeyUpdate({ set: { physicalQuantity: money(stock), reservedQuantity: sku === "ABF-INOX-3" ? money(2) : money(0) } });
    }

    const serviceCategory = (await tx.select().from(serviceCategories).where(and(eq(serviceCategories.tenantId, tenantId), eq(serviceCategories.name, "Performance"))).limit(1))[0];
    const serviceCategoryId = serviceCategory?.id ?? Number((await tx.insert(serviceCategories).values({ tenantId, name: "Performance", description: "Serviços de performance e escapamento." }))[0].insertId);
    const serviceSeeds = [
      ["Downpipe", 180, 350, 120, "Instalação de downpipe com conferência de vedação.", [ ["DP-BMW-320", 1], ["JNT-3", 1], ["ABR-3", 2] ]],
      ["Catback", 360, 700, 240, "Instalação de sistema catback e alinhamento de ponteiras.", [ ["TUB-INOX-3", 1], ["ABF-INOX-3", 1], ["PON-INOX-3", 2], ["JNT-3", 2], ["ABR-3", 4] ]],
      ["Troca de abafador", 120, 280, 80, "Substituição de abafador esportivo ou silencioso.", [ ["ABF-INOX-3", 1], ["ABR-3", 2] ]],
      ["Intake", 240, 420, 150, "Instalação de intake com inspeção de conexões.", [ ["INT-BMW-320", 1] ]],
      ["Fabricação personalizada", 480, 950, 300, "Projeto e fabricação sob medida em inox.", [ ["TUB-INOX-3", 2], ["ABR-3", 4] ]],
      ["Instalação de ponteiras", 120, 220, 70, "Instalação e ajuste de ponteiras.", [ ["PON-INOX-3", 2], ["ABR-3", 2] ]],
    ] as const;
    const serviceIds = new Map<string, number>();
    for (const [name, minutes, laborPrice, cost, description, components] of serviceSeeds) {
      const current = (await tx.select().from(services).where(and(eq(services.tenantId, tenantId), eq(services.name, name))).limit(1))[0];
      const serviceId = current?.id ?? Number((await tx.insert(services).values({ tenantId, categoryId: serviceCategoryId, name, description, estimatedMinutes: minutes, laborPrice: money(laborPrice), estimatedCost: money(cost), desiredMarginPercent: money(((laborPrice - cost) / laborPrice) * 100), quoteQuestions: [{ id: "vehicle-condition", label: "O veículo possui alguma modificação relacionada?", required: false, type: "text" }] }))[0].insertId);
      serviceIds.set(name, serviceId);
      for (const [sku, quantity] of components) {
        await tx.insert(serviceProducts).values({ tenantId, serviceId, productId: productIds.get(sku)!, quantity: money(quantity), required: true }).onDuplicateKeyUpdate({ set: { quantity: money(quantity), required: true } });
      }
    }

    const customerSeeds = [
      ["João Silva", "5511999991001", "joao.silva@example.com"], ["Mariana Costa", "5511999991002", "mariana.costa@example.com"], ["Lucas Almeida", "5511999991003", "lucas.almeida@example.com"], ["Bruno Martins", "5511999991004", "bruno.martins@example.com"], ["Felipe Santos", "5511999991005", "felipe.santos@example.com"],
    ] as const;
    const customerIds = new Map<string, number>();
    for (const [name, whatsapp, email] of customerSeeds) {
      const current = (await tx.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.whatsapp, whatsapp))).limit(1))[0];
      const customerId = current?.id ?? Number((await tx.insert(customers).values({ tenantId, name, whatsapp, email, notes: "Cadastro demonstrativo para apresentação comercial." }))[0].insertId);
      customerIds.set(name, customerId);
    }
    const vehicleSeeds = [["João Silva", "BMW", "320i", 2021, "DMP-3A21"], ["Mariana Costa", "Volkswagen", "Golf GTI", 2023, "GTI-7B23"], ["Lucas Almeida", "Honda", "Civic Touring", 2022, "CVT-2C22"], ["Bruno Martins", "Volkswagen", "Jetta GLI", 2023, "GLI-4D23"], ["Felipe Santos", "Audi", "A3", 2022, "AUD-5E22"]] as const;
    const vehicleIds = new Map<string, number>();
    for (const [customer, make, model, modelYear, plate] of vehicleSeeds) {
      const existing = (await tx.select().from(vehicles).where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.plate, plate))).limit(1))[0];
      const vehicleId = existing?.id ?? Number((await tx.insert(vehicles).values({ tenantId, customerId: customerIds.get(customer)!, make, model, modelYear, manufactureYear: modelYear, plate, mileage: 42000, engine: "Motor turbo" }))[0].insertId);
      vehicleIds.set(customer, vehicleId);
    }

    const existingRequest = (await tx.select().from(quoteRequests).where(and(eq(quoteRequests.tenantId, tenantId), eq(quoteRequests.number, 182))).limit(1))[0];
    if (!existingRequest) {
      const requestId = Number((await tx.insert(quoteRequests).values({ tenantId, number: 182, customerId: customerIds.get("João Silva"), vehicleId: vehicleIds.get("João Silva"), serviceId: serviceIds.get("Downpipe"), requesterName: "João Silva", requesterWhatsapp: "5511999991001", requesterEmail: "joao.silva@example.com", vehicleSnapshot: { make: "BMW", model: "320i", year: 2021, plate: "DMP-3A21" }, serviceLabel: "Downpipe", answers: { vehicleCondition: "Veículo original, sem alterações no escape." }, description: "Gostaria de instalar um Downpipe e fazer a instalação.", source: "public_link", status: "new" }))[0].insertId);
      await tx.insert(quoteRequestEvents).values({ tenantId, quoteRequestId: requestId, type: "created", metadata: { demo: true, presentation: true } });
    }

    return { tenantId, ownerUserId, attendantUserId, technicianUserId, demoSlug: DEMO_SLUG };
  });
}

const DEMO_CHILD_TABLES = [
  "audit_logs", "notifications", "work_order_consumption", "work_order_notes", "work_order_checklists", "work_order_items", "work_orders", "appointments", "quote_events", "quote_items", "quotes", "attachments", "quote_request_events", "quote_requests", "inventory_reservations", "inventory_movements", "purchase_order_items", "purchase_orders", "service_products", "kit_items", "kits", "services", "products", "inventory_balances", "vehicles", "customers", "suppliers", "product_categories", "service_categories",
] as const;

export async function resetDemoTenant(actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL é obrigatório para resetar a demonstração.");
  const tenant = (await db.select({ id: tenants.id, isDemo: tenants.isDemo }).from(tenants).where(eq(tenants.slug, DEMO_SLUG)).limit(1))[0];
  if (!tenant) throw new Error("Tenant demonstrativo não encontrado.");
  if (!tenant.isDemo) throw new Error("Reset bloqueado: o slug informado não está marcado como ambiente demonstrativo.");

  await db.transaction(async tx => {
    await tx.insert(auditLogs).values({ tenantId: tenant.id, actorUserId: actorUserId ?? null, action: "demo.reset", entityType: "tenant", entityId: tenant.id, before: { isDemo: true }, after: { reset: true, isDemo: true }, metadata: { scope: "demo-only", tables: DEMO_CHILD_TABLES } });
    for (const table of DEMO_CHILD_TABLES) {
      await tx.execute(sql.raw(`DELETE FROM \`${table}\` WHERE \`tenantId\` = ${tenant.id}`));
    }
    await tx.update(tenantSettings).set({ quoteMessageTemplate: "Olá, {cliente}. Seu orçamento da Performance Garage está pronto para revisão." }).where(eq(tenantSettings.tenantId, tenant.id));
  });
  return seedDemoTenant();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reset = process.argv.includes("--reset");
  (reset ? resetDemoTenant() : seedDemoTenant()).then(result => {
    console.log(JSON.stringify({ ok: true, reset, ...result }, null, 2));
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
