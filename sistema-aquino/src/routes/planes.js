// src/routes/planes.js
import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

/** GET /planes
 *  Devuelve listado de planes (código, nombre, importes fijos si aplica)
 */
router.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         codigo_pla AS codigo,
         nombre_pla AS nombre,
         impfij_pla AS importe_fijo_titular,
         impadh_pla AS importe_fijo_adherente,
         desdea_pla AS adherente_desde
       FROM planes
       ORDER BY codigo_pla`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
