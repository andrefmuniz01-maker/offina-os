// Gera o "Build Output API v3" da Vercel em .vercel/output:
//   - static/        -> front-end (Vite) servido como arquivos estáticos
//   - functions/api  -> API tRPC (Express) como função serverless
//   - config.json    -> roteamento: arquivos > /api e /manus-storage > SPA
//
// Motivo: o projeto é um servidor Express único (API + front). A Vercel não
// executa esse servidor; sem esta configuração ela publica a pasta dist/ como
// estática e o navegador mostra o código de dist/index.js em vez do sistema.
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, ".vercel", "output");
const fnDir = path.join(outDir, "functions", "api.func");

// As variáveis VITE_* são embutidas no navegador na hora do build. Sem elas o
// front quebra com tela em branco, então é melhor falhar o deploy com um aviso
// claro do que publicar um site que não abre.
const requiredAtBuild = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
const missing = requiredAtBuild.filter(name => !process.env[name]?.trim());
if (process.env.VERCEL && missing.length > 0) {
  console.error(`\nDeploy interrompido: faltam variáveis de ambiente na Vercel: ${missing.join(", ")}.`);
  console.error("Cadastre em Project Settings > Environment Variables (Production) e faça um novo deploy.\n");
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  console.warn("Aviso: SUPABASE_SERVICE_ROLE_KEY não definida — convites por e-mail e o intake público não vão funcionar.");
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(fnDir, { recursive: true });

console.log("1/3 Compilando o front-end (Vite)...");
execSync("pnpm exec vite build", { cwd: root, stdio: "inherit" });
cpSync(path.join(root, "dist", "public"), path.join(outDir, "static"), { recursive: true });

console.log("2/3 Empacotando a API (esbuild)...");
await build({
  entryPoints: [path.join(root, "server", "_core", "vercel.ts")],
  outfile: path.join(fnDir, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  logLevel: "warning",
  // Dependências CommonJS empacotadas dentro de um bundle ESM precisam de require/__dirname.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirname_fn } from 'node:path';",
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __dirname_fn(__filename);",
    ].join("\n"),
  },
});
writeFileSync(
  path.join(fnDir, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", maxDuration: 30 }, null, 2),
);

console.log("3/3 Escrevendo o roteamento...");
writeFileSync(
  path.join(outDir, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: "filesystem" },
        { src: "/api/(.*)", dest: "/api" },
        { src: "/manus-storage/(.*)", dest: "/api" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

if (!existsSync(path.join(outDir, "static", "index.html"))) {
  console.error("Falha: index.html não foi gerado no build do front-end.");
  process.exit(1);
}
console.log("Build da Vercel concluído em .vercel/output");
