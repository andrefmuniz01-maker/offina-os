import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const requiredPaths = [
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "vitest.config.ts",
  "vite.config.ts",
  "client/src/App.tsx",
  "client/src/lib/supabase.ts",
  "server/_core/index.ts",
  "server/_core/context.ts",
  "server/_core/supabase.ts",
  "server/routers.ts",
  "server/tenantAccess.ts",
  "server/storage.ts",
  "server/scheduled.ts",
  "drizzle.config.ts",
  "drizzle/schema.ts",
  "supabase/migrations/20260826_0001_oficinaos_foundation.sql",
  "supabase/migrations/20260826_0002_foreign_key_indexes.sql",
  "supabase/migrations/20260826_0003_profile_rls_initplan.sql",
  "docs/environment-reference.md",
  "docs/production-handoff.md",
  "scripts/production-preflight.mjs",
  "docs/repository-portability.md",
  "docs/portability-inventory.md",
  "docs/mysql-to-supabase-mapping.md",
  "docs/supabase-magic-link-configuration.md",
];

const absent = [];
const untracked = [];
for (const path of requiredPaths) {
  try {
    await access(path, constants.R_OK);
  } catch {
    absent.push(path);
  }

  try {
    await execFileAsync("git", ["ls-files", "--error-unmatch", "--", path]);
  } catch {
    untracked.push(path);
  }
}

if (absent.length > 0) {
  console.error("Artefatos de portabilidade ausentes:\n" + absent.map(path => `- ${path}`).join("\n"));
  process.exit(1);
}

if (untracked.length > 0) {
  console.error("Artefatos de portabilidade ainda não rastreados pelo Git:\n" + untracked.map(path => `- ${path}`).join("\n"));
  process.exit(1);
}

console.log(`Inventário de portabilidade aprovado: ${requiredPaths.length} artefatos presentes e rastreados pelo Git.`);
