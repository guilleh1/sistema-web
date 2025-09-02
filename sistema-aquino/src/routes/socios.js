// src/routes/socios.js
import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

/** Util: calcular edad desde fecha ISO (yyyy-mm-dd) */
function calcEdadFromISO(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  let e = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
  return e >= 0 ? e : null;
}

/** LISTA para la grilla Afiliados
 *  Mejoras:
 *   - ?limit=all  -> devuelve todos (sin LIMIT)
 *   - ?limit=n&offset=m -> pagina desde servidor
 *   - Sin query -> COMPAT: LIMIT 1000 (como antes)
 */
router.get("/socios", async (req, res, next) => {
  try {
    const q = req.query || {};
    const limitRaw = (q.limit ?? "").toString().trim().toLowerCase();
    const offsetRaw = (q.offset ?? "").toString().trim();

    const isAll = limitRaw === "all" || limitRaw === "0";
    const limitNum = !isAll ? Number.parseInt(limitRaw, 10) : null;
    const offsetNum = !isAll ? Number.parseInt(offsetRaw || "0", 10) : 0;

    // Compatibilidad: si no mandan nada, dejamos el LIMIT 1000 original
    const useDefaultLimit = !isAll && (!Number.isFinite(limitNum) || limitNum <= 0);

    let sql = `
      SELECT 
        NUMERO_CLI   AS numero_cli,
        NOMBRE_CLI   AS nombre_cli,
        NRODOC_CLI   AS nrodoc_cli,
        EDAD_CLI     AS edad_cli,
        FECVIG_CLI   AS fecvig_cli,
        CODZON_CLI   AS codzon_cli,
        CODPLA_CLI   AS codpla_cli,
        PREPAG_CLI   AS prepag_cli
      FROM maecli
      ORDER BY NUMERO_CLI ASC
    `;

    const params = [];

    if (isAll) {
      // sin LIMIT
    } else if (useDefaultLimit) {
      sql += `\nLIMIT 1000`;
    } else {
      // LIMIT/OFFSET parametrizados
      const lim = Math.max(1, limitNum);
      const off = Math.max(0, Number.isFinite(offsetNum) ? offsetNum : 0);
      sql += `\nLIMIT ? OFFSET ?`;
      params.push(lim, off);
    }

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows || [] });
  } catch (err) {
    next(err);
  }
});

/** OBTENER uno por numero_cli (detalle/edición) */
router.get("/socios/:numero_cli(\\d+)", async (req, res, next) => {
  try {
    const numero = req.params.numero_cli;
    const [rows] = await pool.query(
      `SELECT 
         NUMERO_CLI,
         NOMBRE_CLI,
         TIPDOC_CLI,
         NRODOC_CLI,
         CUIT_CLI,
         SEXOOO_CLI,
         FNACIM_CLI,
         DOMICI_CLI,
         CIUDAD_CLI,
         CODPOS_CLI,
         CODZON_CLI,
         CODPLA_CLI,
         PREPAG_CLI,
         FECING_CLI,
         FECVIG_CLI,
         OBSERV_CLI,
         EDAD_CLI,
         TELCEL_CLI
       FROM maecli
       WHERE NUMERO_CLI = ?`,
      [numero]
    );
    res.json({ ok: true, data: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

/** ALTA (validación de unicidad por número y DNI) */
router.post("/socios", async (req, res, next) => {
  try {
    const b = req.body || {};

    // Validación de unicidad (solo si vienen datos en esos campos)
    if (b.NUMERO_CLI != null && b.NUMERO_CLI !== "") {
      const [rNum] = await pool.query(
        `SELECT 1 FROM maecli WHERE NUMERO_CLI = ? LIMIT 1`,
        [b.NUMERO_CLI]
      );
      if (rNum.length) {
        return res.status(409).json({
          ok: false,
          code: "DUP_NUMERO",
          field: "NUMERO_CLI",
          message: "El número de socio ya existe.",
        });
      }
    }
    if (b.NRODOC_CLI != null && b.NRODOC_CLI !== "") {
      const [rDni] = await pool.query(
        `SELECT 1 FROM maecli WHERE NRODOC_CLI = ? LIMIT 1`,
        [b.NRODOC_CLI]
      );
      if (rDni.length) {
        return res.status(409).json({
          ok: false,
          code: "DUP_DNI",
          field: "NRODOC_CLI",
          message: "El DNI ya existe.",
        });
      }
    }

    // Si los índices únicos existen, por las dudas interceptamos errores de MySQL
    const edad = calcEdadFromISO(b.FNACIM_CLI || null);

    try {
      const [r] = await pool.query(
        `INSERT INTO maecli (
          NUMERO_CLI,
          NOMBRE_CLI,
          TIPDOC_CLI,
          NRODOC_CLI,
          CUIT_CLI,
          SEXOOO_CLI,
          FNACIM_CLI,
          DOMICI_CLI,
          CIUDAD_CLI,
          TELCEL_CLI,
          CODPOS_CLI,
          CODZON_CLI,
          CODPLA_CLI,
          PREPAG_CLI,
          FECING_CLI,
          FECVIG_CLI,
          OBSERV_CLI,
          EDAD_CLI
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          b.NUMERO_CLI ?? null,
          b.NOMBRE_CLI ?? null,
          b.TIPDOC_CLI ?? null,
          b.NRODOC_CLI ?? null,
          b.CUIT_CLI ?? null,
          b.SEXOOO_CLI ?? null,
          b.FNACIM_CLI ?? null,
          b.DOMICI_CLI ?? null,
          b.CIUDAD_CLI ?? null,
          b.TELCEL_CLI ?? null,
          b.CODPOS_CLI ?? null,
          b.CODZON_CLI ?? null,
          b.CODPLA_CLI ?? null,
          b.PREPAG_CLI ?? null,
          b.FECING_CLI ?? null,
          b.FECVIG_CLI ?? null,
          b.OBSERV_CLI ?? null,
          edad,
        ]
      );

      const [rows] = await pool.query(
        `SELECT * FROM maecli WHERE NUMERO_CLI = ?`,
        [b.NUMERO_CLI]
      );
      return res.json({ ok: true, data: rows[0] || null, insertedId: r.insertId });
    } catch (e) {
      // ER_DUP_ENTRY por índices únicos
      if (e && e.code === "ER_DUP_ENTRY") {
        const msg = (e.sqlMessage || "").toLowerCase();
        if (msg.includes("uniq_numero_cli")) {
          return res.status(409).json({
            ok: false,
            code: "DUP_NUMERO",
            field: "NUMERO_CLI",
            message: "El número de socio ya existe.",
          });
        }
        if (msg.includes("uniq_nrodoc_cli")) {
          return res.status(409).json({
            ok: false,
            code: "DUP_DNI",
            field: "NRODOC_CLI",
            message: "El DNI ya existe.",
          });
        }
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

/** EDITAR (recalcular edad desde FNACIM_CLI) — ahora también permite cambiar NUMERO_CLI y TELCEL_CLI */
router.put("/socios/:numero_cli", async (req, res, next) => {
  try {
    const numero = req.params.numero_cli;
    const b = req.body || {};
    const edad = calcEdadFromISO(b.FNACIM_CLI || null);

    const nuevoNumero = b.NUMERO_CLI ?? numero;

    // Si quiere cambiar el número, validar duplicados
    if (String(nuevoNumero) !== String(numero)) {
      const [dup] = await pool.query(
        `SELECT 1 FROM maecli WHERE NUMERO_CLI = ? LIMIT 1`,
        [nuevoNumero]
      );
      if (dup.length) {
        return res.status(409).json({
          ok: false,
          code: "DUP_NUMERO",
          field: "NUMERO_CLI",
          message: `El número de socio ${nuevoNumero} ya existe.`,
        });
      }
    }

    await pool.query(
      `UPDATE maecli SET
        NUMERO_CLI = ?,
        NOMBRE_CLI = ?,
        TIPDOC_CLI = ?,
        NRODOC_CLI = ?,
        CUIT_CLI   = ?,
        SEXOOO_CLI = ?,
        FNACIM_CLI = ?,
        DOMICI_CLI = ?,
        CIUDAD_CLI = ?,
        TELCEL_CLI = ?,
        CODPOS_CLI = ?,
        CODZON_CLI = ?,
        CODPLA_CLI = ?,
        PREPAG_CLI = ?,
        FECING_CLI = ?,
        FECVIG_CLI = ?,
        OBSERV_CLI = ?,
        EDAD_CLI   = ?
      WHERE NUMERO_CLI = ?`,
      [
        nuevoNumero,
        b.NOMBRE_CLI ?? null,
        b.TIPDOC_CLI ?? null,
        b.NRODOC_CLI ?? null,
        b.CUIT_CLI ?? null,
        b.SEXOOO_CLI ?? null,
        b.FNACIM_CLI ?? null,
        b.DOMICI_CLI ?? null,
        b.CIUDAD_CLI ?? null,
        b.TELCEL_CLI ?? null,
        b.CODPOS_CLI ?? null,
        b.CODZON_CLI ?? null,
        b.CODPLA_CLI ?? null,
        b.PREPAG_CLI ?? null,
        b.FECING_CLI ?? null,
        b.FECVIG_CLI ?? null,
        b.OBSERV_CLI ?? null,
        edad,
        numero, // WHERE
      ]
    );

    const [rows] = await pool.query(
      `SELECT * FROM maecli WHERE NUMERO_CLI = ?`,
      [nuevoNumero]
    );
    res.json({ ok: true, data: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

export default router;
