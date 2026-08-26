import { readFile, writeFile } from "node:fs/promises";

const migrationPath = process.argv[2];
const migrationName = process.argv[3];

if (!migrationPath || !migrationName) {
  throw new Error("Usage: node scripts/prepare-supabase-migration-payload.mjs <migration-path> <migration-name>");
}

const outputPath = "/home/ubuntu/officina-os/.supabase-migration-payload.json";
const query = await readFile(migrationPath, "utf8");

await writeFile(
  outputPath,
  JSON.stringify(
    {
      project_id: "jpvvhowgpuinuuputoot",
      name: migrationName,
      query,
    },
    null,
    2,
  ),
);

console.log(outputPath);
