// src/services/grupos.service.js
import { pool } from "../db.js";  // <— IMPORT CON NOMBRE

/**
 * Devuelve todos los integrantes del grupo (titular + adherentes),
 * incluyendo columnas que necesita la vista VFP:
 *  - nrodoc_cli (DNI)
 *  - fecvig_cli (Cobertura)  [si está vacía la vista no muestra nada]
 *  - fnacim_cli (Nacimiento)
 *  - codzon_cli, domici_cli, ciudad_cli (zona, domicilio, localidad)
 *  - prepag_cli (ajuste del grupo)
 *  - codpla_cli (plan del titular)
 */
export async function getIntegrantesGrupo(socio) {
  const s = String(socio).replace(/[^\d]/g, "");
  const base = Math.floor(Number(s) / 100) * 100;
  const to = base + 99;

  const [rows] = await pool.query(
    `
    SELECT
      numero_cli,
      nombre_cli,
      fnacim_cli,
      nrodoc_cli,     -- DNI
      fecvig_cli,     -- Cobertura (si está vacía, la vista VFP la deja en blanco)
      fecing_cli,     -- Alta (no se muestra, pero puede servir)
      codzon_cli,
      domici_cli,
      ciudad_cli,
      codpla_cli,
      prepag_cli
    FROM maecli
    WHERE numero_cli BETWEEN ? AND ?
    ORDER BY numero_cli ASC
    `,
    [base, to]
  );

  return rows;
}

/**
 * Plan del titular del grupo.
 */
export async function getPlanDelTitular(socio) {
  const s = String(socio).replace(/[^\d]/g, "");
  const base = Math.floor(Number(s) / 100) * 100;

  const [[row]] = await pool.query(
    `
    SELECT p.*
    FROM planes p
    INNER JOIN maecli m ON m.codpla_cli = p.codigo_pla
    WHERE m.numero_cli = ?
    LIMIT 1
    `,
    [base]
  );

  return row || null;
}

/**
 * Parámetros del sistema (si existiera solo una fila).
 */
export async function getSistema() {
  const [[row]] = await pool.query(`SELECT * FROM sistema LIMIT 1`);
  return row || {};
}

/**
 * Tramo de edades:
 *  - primer registro con hastae_eda >= edad
 *  - trae valores de titular y adherente
 */
export async function getEdadesRow(codpla, edad) {
  const [[row]] = await pool.query(
    `
    SELECT hastae_eda, imptit_eda, impadh_eda
    FROM edades
    WHERE codpla_eda = ?
      AND hastae_eda >= ?
    ORDER BY hastae_eda ASC
    LIMIT 1
    `,
    [codpla, edad]
  );
  return row || null;
}
