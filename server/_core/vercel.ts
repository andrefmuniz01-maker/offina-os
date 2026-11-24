import { createApiApp } from "./app";

// Ponto de entrada da função serverless da Vercel (empacotada por
// scripts/build-vercel.mjs). Um app Express é um handler (req, res) válido.
export default createApiApp();
