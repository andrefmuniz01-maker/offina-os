import { config } from "dotenv";

// Vitest não injeta ".env.local" em process.env por padrão (só expõe via
// import.meta.env para o cliente). Sem isso, testes que dependem de
// credenciais reais (ex.: server/supabase.credentials.test.ts) falham com
// "undefined" mesmo com o arquivo presente e correto.
config();
config({ path: ".env.local", override: true });
