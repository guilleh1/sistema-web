// src/routes/catalogos.js
import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// ZONAS: devuelve {id, nombre}
router.get("/zonas", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT codigo_zon AS id, nombre_zon AS nombre 
       FROM zonas 
       ORDER BY nombre_zon ASC`
    );
    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    next(err);
  }
});

// PLANES: devuelve {id, nombre}
router.get("/planes", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT codigo_pla AS id, nombre_pla AS nombre 
       FROM planes 
       ORDER BY nombre_pla ASC`
    );
    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    next(err);
  }
});

export default router;
