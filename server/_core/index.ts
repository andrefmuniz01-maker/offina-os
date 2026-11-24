import "dotenv/config";
// "dotenv/config" carrega somente ".env". Este projeto usa ".env.local" (a
// convenção do Vite para segredos locais, já no .gitignore), então sem isso
// o processo do servidor sobe sem nenhuma credencial do Supabase configurada
// — toda chamada de auth falha com "Supabase Auth não está configurado no
// servidor.", disfarçada de sessão/perfil indisponível para quem só vê a UI.
// Precisa ser um side-effect import (não uma chamada de função aqui embaixo):
// imports são avaliados antes de qualquer statement deste arquivo, então uma
// chamada direta rodaria tarde demais, depois que os módulos abaixo já leram
// process.env nos seus próprios top-levels.
import "./loadEnvLocal";
import { createServer } from "http";
import net from "net";
import { createApiApp } from "./app";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = createApiApp();
  const server = createServer(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
