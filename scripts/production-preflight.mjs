const required = [
  "NODE_ENV",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
];

const missing = required.filter(name => !process.env[name]?.trim());
const issues = [];
const warnings = [];

if (process.env.NODE_ENV !== "production") {
  issues.push("NODE_ENV deve ser exatamente production.");
}

if (process.env.VITE_SUPABASE_URL) {
  try {
    const url = new URL(process.env.VITE_SUPABASE_URL);
    if (url.protocol !== "https:") {
      issues.push("VITE_SUPABASE_URL deve usar HTTPS.");
    }
  } catch {
    issues.push("VITE_SUPABASE_URL não é uma URL válida.");
  }
}

if (process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_secret_")) {
  issues.push("VITE_SUPABASE_PUBLISHABLE_KEY parece ser uma chave secreta; use somente a publishable/anon key no frontend.");
}

if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_publishable_")) {
  issues.push("SUPABASE_SERVICE_ROLE_KEY parece ser uma chave pública; configure a chave administrativa somente no servidor.");
}

if (!process.env.BUILT_IN_FORGE_API_URL || !process.env.BUILT_IN_FORGE_API_KEY) {
  warnings.push("BUILT_IN_FORGE_API_URL/BUILT_IN_FORGE_API_KEY não configuradas; anexos de alguns fluxos legados e recursos internos podem permanecer indisponíveis.");
}

if (missing.length > 0) {
  issues.push(`Variáveis obrigatórias ausentes: ${missing.join(", ")}.`);
}

if (issues.length > 0) {
  console.error("Preflight de produção reprovado:");
  for (const issue of issues) console.error(`- ${issue}`);
  if (warnings.length > 0) {
    console.error("Avisos:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log("Preflight de produção aprovado: ambiente, Supabase e ponte de dados configurados.");
for (const warning of warnings) console.warn(`Aviso: ${warning}`);
