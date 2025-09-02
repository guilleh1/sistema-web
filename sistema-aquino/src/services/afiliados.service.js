// src/services/afiliados.service.js
import { pool } from "../db.js";

/**
 * Lista afiliados con filtros y paginación.
 *
 * Parámetros:
 *  - tipo: "numero" | "nombre" | undefined
 *  - q: término de búsqueda (string)
 *  - page: número de página (1..n)
 *  - pageSize: filas por página (default 50, máx 500)
 *
 * Reglas:
 *  - tipo="numero":
 *      * si q = "13800" (o "13801"...), toma el grupo = floor(13800 / 100) => 138
 *      * si q = "138" (solo grupo), toma grupo = 138
 *      => en ambos casos devuelve TODO el grupo 138 (00, 01, 02, ...)
 *  - tipo="nombre":
 *      * se interpreta como "Apellido [Nombres...]"
 *      * primer token: m.NOMBRE_CLI LIKE 'Apellido%'
 *      * tokens restantes: m.NOMBRE_CLI LIKE '% Nombre%'
 *    (usa COLLATE utf8mb4_general_ci para que sea case/acento-insensible)
 *
 * Orden:
 *  - por grupo asc, luego sufijo asc (00 = titular)
 */
export async function listarAfiliados({
  tipo,
  q,
  page = 1,
  pageSize = 50,
} = {}) {
  // Sanitizar paginación
  page = Math.max(1, Number(page || 1));
  pageSize = Math.min(500, Math.max(1, Number(pageSize || 50)));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];

  if (tipo === "numero" && q) {
    const digits = String(q).replace(/\D/g, "");
    if (digits.length) {
      const n = Number(digits);
      // Si el usuario escribe 3-4 dígitos (p.ej. "138" o "1730"): lo tomamos como GRUPO.
      // Si escribe más (p.ej. "13800"): lo tomamos como NÚMERO COMPLETO => grupo = floor(n/100).
      let grupo;
      if (digits.length <= 4) {
        grupo = n;
      } else {
        grupo = Math.floor(n / 100);
      }
      where.push("FLOOR(m.NUMERO_CLI / 100) = ?");
      params.push(grupo);
    }
  } else if (tipo === "nombre" && q) {
    // Normalizamos espacios y separamos tokens
    const tokens = q.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (tokens.length) {
      // Primer token: apellido (debe matchear desde el inicio)
      where.push("m.NOMBRE_CLI COLLATE utf8mb4_general_ci LIKE ?");
      params.push(`${tokens[0]}%`);

      // Tokens restantes: nombres, como palabras posteriores
      for (let i = 1; i < tokens.length; i++) {
        where.push("m.NOMBRE_CLI COLLATE utf8mb4_general_ci LIKE ?");
        params.push(`% ${tokens[i]}%`);
      }
    }
  }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const baseFrom = `
    FROM maecli m
    LEFT JOIN planes p ON p.codigo_pla = m.CODPLA_CLI
    ${whereSQL}
  `;

  // Total de filas para paginación
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total ${baseFrom}`,
    params
  );
  const total = Number(countRows?.[0]?.total || 0);

  // Datos de la página
  const selectSQL = `
    SELECT
      m.NUMERO_CLI AS numero,
      FLOOR(m.NUMERO_CLI / 100) AS grupo,
      LPAD(MOD(m.NUMERO_CLI, 100), 2, '0') AS sufijo,
      CONCAT(FLOOR(m.NUMERO_CLI / 100), '/', LPAD(MOD(m.NUMERO_CLI, 100), 2, '0')) AS numero_fmt,
      m.NOMBRE_CLI AS apellido,
      m.DOMICI_CLI AS domicilio,
      m.NRODOC_CLI AS nro_doc,
      m.FNACIM_CLI AS f_nac,
      COALESCE(p.nombre_pla, '') AS plan,
      m.PREPAG_CLI AS prepago,
      m.CODMUT_CLI AS os,
      m.FECING_CLI AS f_ing
    ${baseFrom}
    ORDER BY grupo ASC, CAST(LPAD(MOD(m.NUMERO_CLI, 100), 2, '0') AS UNSIGNED) ASC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(selectSQL, [...params, pageSize, offset]);

  return { data: rows, total, page, pageSize };
}
