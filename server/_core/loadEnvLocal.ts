import { config } from "dotenv";

// Módulo de efeito colateral: precisa ser importado (como side-effect import,
// não com bindings) antes de qualquer módulo que leia process.env, para que a
// ordem de avaliação de módulos ES garanta que os valores já estejam
// presentes. Veja o comentário em server/_core/index.ts.
config({ path: ".env.local", override: true });
