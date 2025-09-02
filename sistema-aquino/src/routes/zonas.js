// src/routes/zonas.js
import { Router } from "express";
import asyncHandler from "express-async-handler";
import { pool } from "../db.js";

const router = Router();

/**
 * Devuelve: [{ id, codigo, nombre, comision }]
 * Usamos codigo_zon como id (no hay columna id numérica).
 */
router.get("/", asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT 
       codigo_zon  AS id,
       codigo_zon  AS codigo,
       nombre_zon  AS nombre,
       comisi_zon  AS comision
     FROM zonas
     ORDER BY codigo_zon`
  );
  res.json(rows);
}));

export default router;
