// sistema-aquino/src/routes/socios.ultimo.js
import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// Helper para poner no-cache en las respuestas JSON
function noCache(res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
}

/**
 * GET /socios/ultimo-numero
 * Devuelve el último por valor DESC (sin MAX, a prueba de balas)
 * Respuesta: { ok: true, data: { numero_cli, numero_fmt } }
 */
router.get("/ultimo-numero", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(`
      SELECT NUMERO_CLI AS n
      FROM maecli
      WHERE NUMERO_CLI IS NOT NULL
      ORDER BY NUMERO_CLI DESC
      LIMIT 1
    `);

    const n = rows?.[0]?.n ?? null;

    noCache(res);

    if (n == null) return res.status(200).json({ ok: true, data: null });

    const base = Math.floor(Number(n) / 100);
    const suf = String(Number(n) % 100).padStart(2, "0");

    return res.status(200).json({
      ok: true,
      data: { numero_cli: Number(n), numero_fmt: `${base}/${suf}` },
    });
  } catch (err) {
    next(err);
  } finally {
    conn.release();
  }
});

/**
 * DEBUG: compara MAX() vs ORDER BY…LIMIT 1 y lista top 10
 */
router.get("/ultimo-numero/debug", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const [[maxRow]] = await conn.query(`
      SELECT MAX(NUMERO_CLI) AS max_direct
      FROM maecli
      WHERE NUMERO_CLI IS NOT NULL
    `);

    const [[orderRow]] = await conn.query(`
      SELECT NUMERO_CLI AS n
      FROM maecli
      WHERE NUMERO_CLI IS NOT NULL
      ORDER BY NUMERO_CLI DESC
      LIMIT 1
    `);

    const [top10] = await conn.query(`
      SELECT NUMERO_CLI
      FROM maecli
      ORDER BY NUMERO_CLI DESC
      LIMIT 10
    `);

    noCache(res);

    res.status(200).json({
      ok: true,
      data: {
        max_direct: maxRow?.max_direct ?? null,
        top1_order_desc: orderRow?.n ?? null,
        top10,
      },
    });
  } catch (err) {
    next(err);
  } finally {
    conn.release();
  }
});

export default router;
