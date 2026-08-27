import mysql from "mysql2/promise";

const email = "felipefmuniz@gmail.com";
const openId = process.env.OWNER_OPEN_ID;

if (!openId || !process.env.DATABASE_URL) {
  throw new Error("As variáveis de ambiente necessárias não estão disponíveis.");
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  await connection.execute(
    `INSERT INTO users (openId, name, email, loginMethod, role, platformRole, lastSignedIn)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       email = VALUES(email),
       loginMethod = VALUES(loginMethod),
       role = VALUES(role),
       platformRole = VALUES(platformRole),
       lastSignedIn = NOW()`,
    [openId, "Felipe F Muniz", email, "manus", "admin", "super_admin"],
  );

  console.log("SUPER_ADMIN_CONFIGURED");
} finally {
  await connection.end();
}
