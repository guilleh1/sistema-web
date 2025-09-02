// src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";

import sociosRouter from "./routes/socios.js";
import catalogosRouter from "./routes/catalogos.js";
import gruposRouter from "./routes/grupos.js";            // v1 (lo que ya tenías)
import sociosUltimoRouter from "./routes/socios.ultimo.js";
import bajasRouter from "./routes/bajas.js";

// ⬇️ NUEVO: router v2 para cálculo del precio del grupo
import gruposV2CalcRouter from "./routes/grupos.v2.calc.js";

const app = express();
app.set("etag", false);

app.use(cors());                 // si querés, podemos afinar origins
app.use(express.json());
app.use(morgan("dev"));

// ===== Rutas existentes =====
app.use("/socios", sociosUltimoRouter);
app.use(sociosRouter);
app.use("/socios", bajasRouter);             // POST /socios/:numero/baja
app.use("/catalogos", catalogosRouter);
app.use("/grupos", gruposRouter);            // v1

// ===== NUEVO: rutas v2 de grupos (cálculo total del grupo) =====
app.use("/grupos/v2", gruposV2CalcRouter);   // GET /grupos/v2/calc

// Healthcheck
app.get("/", (_req, res) => {
  res.json({ ok: true, msg: "API OK" });
});

// Manejo de errores
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err?.message || "Server error" });
});

// Arranque
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en: http://localhost:${PORT}`);
  console.log(`GET  /grupos/v2/calc?socio=200&periodo=MM/YYYY`);
  console.log(`(v1) GET  /grupos/v2/calcular-grupo/:socio    (si existe)`);
  console.log(`(v1) POST /grupos/v2/calcular-grupo-draft    (si existe)`);
});

export default app;
