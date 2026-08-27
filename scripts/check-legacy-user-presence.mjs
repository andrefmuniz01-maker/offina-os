import mysql from "mysql2/promise";

export function summarizeLegacyUserPresence(rows) {
  return { legacyUserPresent: rows.length > 0 };
}

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    throw new Error("Uso: pnpm auth:legacy-user:check <email>");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não está configurada para a verificação somente leitura.");
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.execute(
      "SELECT 1 AS legacy_user_present FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email],
    );
    console.log(JSON.stringify(summarizeLegacyUserPresence(rows)));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
