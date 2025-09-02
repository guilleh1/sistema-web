// src/routes/afiliados.js
import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

/** Helpers **/
function nombreSqlLike(q) {
  const s = String(q || "").trim().toUpperCase();
  return s.replace(/\s+/g, " ").trim() + "%";
}

/**
 * Formato único por número:
 * q = "<grupo><adherente>" (solo dígitos)
 * sufijo = últimos 2 dígitos (00..99)
 *   - sufijo === 00 -> rango base..base+99 (grupo completo)
 *   - sufijo !== 00 -> número exacto base + sufijo
 */
function whereDesdeNumero(qRaw) {
  const q = String(qRaw || "").trim();
  if (!/^\d+$/.test(q)) return null;
  const num = Number(q);
  if (!Number.isFinite(num)) return null;

  const grupo = Math.floor(num / 100);
  const sufijo = num % 100;
  const base = grupo * 100;

  if (sufijo === 0) {
    return { where: "WHERE NUMERO_CLI BETWEEN ? AND ?", params: [base, base + 99] };
  }
  return { where: "WHERE NUMERO_CLI = ?", params: [base + sufijo] };
}

/**
 * GET /afiliados
 * - tipo=numero  -> formato único arriba
 * - tipo=nombre  -> LIKE por NOMBRE_CLI (si q vacío, lista todo)
 * - sin q en tipo=numero -> lista todo (paginado)
 * Orden:
 * - si tipo=nombre -> ORDER BY NOMBRE_CLI ASC, NUMERO_CLI ASC
 * - si no          -> ORDER BY NUMERO_CLI ASC
 */
router.get("/", async (req, res, next) => {
  try {
    const tipo = (req.query.tipo || "numero").toString().toLowerCase();
    const qRaw = String(req.query.q ?? "").trim();

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const pageSizeRaw = Math.max(parseInt(req.query.pageSize || "20", 10), 1);
    const pageSize = Math.min(pageSizeRaw, 200);
    const offset = (page - 1) * pageSize;

    let where = "";
    let params = [];

    if (tipo === "nombre") {
      if (qRaw !== "") {
        where = "WHERE UPPER(NOMBRE_CLI) LIKE ?";
        params.push(nombreSqlLike(qRaw));
      }
    } else {
      if (qRaw !== "") {
        const parsed = whereDesdeNumero(qRaw);
        if (!parsed) {
          return res.json({ ok: true, data: [], total: 0, page, pageSize });
        }
        where = parsed.where;
        params = parsed.params;
      }
    }

    // ORDER BY condicional
    const orderBy =
      tipo === "nombre"
        ? "ORDER BY NOMBRE_CLI ASC, NUMERO_CLI ASC"
        : "ORDER BY NUMERO_CLI ASC";

    // Total
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM maecli ${where}`,
      params
    );
    const total = countRows?.[0]?.total || 0;

    // Página
    const [rows] = await pool.query(
      `SELECT 
         NUMERO_CLI,
         NOMBRE_CLI,
         FNACIM_CLI,
         SEXOOO_CLI,
         DOMICI_CLI,
         CIUDAD_CLI,
         CODPOS_CLI,
         TIPDOC_CLI,
         NRODOC_CLI,
         CUIT_CLI,
         CODZON_CLI,
         CODPLA_CLI,
         PREPAG_CLI,
         FECING_CLI,
         FECVIG_CLI,
         OBSERV_CLI
       FROM maecli
       ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const data = rows.map((r) => {
      const numero = Number(r.NUMERO_CLI);
      const base = Math.floor(numero / 100);
      const suf = numero % 100;
      const numero_fmt = `${base}/${String(suf).padStart(2, "0")}`;
      return {
        numero_cli: numero,
        numero_fmt,
        nombre_cli: r.NOMBRE_CLI,
        fnacim_cli: r.FNACIM_CLI,
        sexo: r.SEXOOO_CLI, // 1=M, 2=F
        domici_cli: r.DOMICI_CLI,
        ciudad_cli: r.CIUDAD_CLI,
        codpos_cli: r.CODPOS_CLI,
        tipdoc_cli: r.TIPDOC_CLI,
        nrodoc_cli: r.NRODOC_CLI,
        cuit_cli: r.CUIT_CLI,
        codzon_cli: r.CODZON_CLI,
        codpla_cli: r.CODPLA_CLI,
        prepag_cli: r.PREPAG_CLI,
        fecing_cli: r.FECING_CLI,
        fecvig_cli: r.FECVIG_CLI,
        observ_cli: r.OBSERV_CLI,
      };
    });

    res.json({ ok: true, data, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

export default router;
