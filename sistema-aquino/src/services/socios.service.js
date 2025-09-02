// src/services/socios.service.js
import { pool } from "../db.js";

/** 
 * Convenciones de sexo:
 *  DB (SEXOOO_CLI tinyint): 1 = Masculino, 2 = Femenino
 *  Lógica CUIT: "M" | "F"
 */
function sexoDbToChar(sexoDb) {
  const v = Number(sexoDb);
  if (v === 2) return "F";
  return "M";
}
function sexoCharToDb(sexoChar) {
  const s = String(sexoChar || "M").trim().toUpperCase();
  return s === "F" ? 2 : 1;
}

/** Dígito verificador CUIT */
function dvCuit(base11 /* 10 dígitos */) {
  const pesos = [5,4,3,2,7,6,5,4,3,2];
  const sum = base11.split("").reduce((acc, ch, i) => acc + Number(ch) * pesos[i], 0);
  const mod = sum % 11;
  const dv = 11 - mod;
  if (dv === 11) return 0;
  if (dv === 10) return 9;
  return dv;
}

/** Calcula CUIT desde DNI y sexo ("M"/"F") */
export function calcCUIT(dni, sexoChar = "M") {
  const pref = sexoChar === "F" ? "27" : "20";
  const base = pref + String(dni).padStart(8, "0");
  const dv = dvCuit(base);
  return base + String(dv);
}

/** Próximo NUMERO_CLI (PK real) */
export async function getNextNroSocio(conn) {
  const [rows] = await conn.query("SELECT COALESCE(MAX(NUMERO_CLI),0) AS maxN FROM maecli");
  return (rows?.[0]?.maxN || 0) + 1;
}

/** Obtiene un socio por NUMERO_CLI */
export async function getSocioByNumero(numeroCli) {
  const [rows] = await pool.query(
    `SELECT 
       NUMERO_CLI, NOMBRE_CLI, FNACIM_CLI, SEXOOO_CLI, 
       DOMICI_CLI, CIUDAD_CLI, CODPOS_CLI, 
       TIPDOC_CLI, NRODOC_CLI, CUIT_CLI, 
       CODZON_CLI, CODPLA_CLI, PREPAG_CLI, 
       FECING_CLI, FECVIG_CLI, OBSERV_CLI
     FROM maecli
     WHERE NUMERO_CLI = ?`,
    [numeroCli]
  );
  return rows[0] || null;
}

/** Alta de socio usando NUMERO_CLI como PK */
export async function crearSocio(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      nombre = "",
      fnacim = null,
      sexo = "M",
      domici = "",
      ciudad = "",
      codpos = "",
      tipdoc = "DNI",
      nrodoc = null,
      cuit = null,
      codzon = null,
      codpla = null,
      prepag = 0,
      fecing = null,
      fecvig = null,
      observ = ""
    } = data || {};

    const sexoDb = sexoCharToDb(sexo);
    const nroSocio = await getNextNroSocio(conn);

    let cuitFinal = cuit;
    if (!cuitFinal && nrodoc) {
      cuitFinal = calcCUIT(nrodoc, sexoDbToChar(sexoDb));
    }

    await conn.query(
      `INSERT INTO maecli (
        NUMERO_CLI, NOMBRE_CLI, FNACIM_CLI, SEXOOO_CLI,
        DOMICI_CLI, CIUDAD_CLI, CODPOS_CLI,
        TIPDOC_CLI, NRODOC_CLI, CUIT_CLI,
        CODZON_CLI, CODPLA_CLI, PREPAG_CLI,
        FECING_CLI, FECVIG_CLI, OBSERV_CLI
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nroSocio, nombre || null, fnacim, sexoDb,
        domici || null, ciudad || null, codpos || null,
        tipdoc || null, nrodoc || null, cuitFinal || null,
        codzon || null, codpla || null, prepag ?? 0,
        fecing, fecvig, observ || null
      ]
    );

    const socio = await getSocioByNumero(nroSocio);

    await conn.commit();
    return socio;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Actualiza un socio existente (por NUMERO_CLI) */
export async function actualizarSocio(numeroCli, patch) {
  // Campos permitidos para edición
  const fields = {
    NOMBRE_CLI: "NOMBRE_CLI",
    FNACIM_CLI: "FNACIM_CLI",
    SEXOOO_CLI: "SEXOOO_CLI",
    DOMICI_CLI: "DOMICI_CLI",
    CIUDAD_CLI: "CIUDAD_CLI",
    CODPOS_CLI: "CODPOS_CLI",
    TIPDOC_CLI: "TIPDOC_CLI",
    NRODOC_CLI: "NRODOC_CLI",
    CUIT_CLI:   "CUIT_CLI",
    CODZON_CLI: "CODZON_CLI",
    CODPLA_CLI: "CODPLA_CLI",
    PREPAG_CLI: "PREPAG_CLI",
    FECING_CLI: "FECING_CLI",
    FECVIG_CLI: "FECVIG_CLI",
    OBSERV_CLI: "OBSERV_CLI",
  };

  const setParts = [];
  const params = [];

  // Normalizamos algunos nombres de body -> columnas
  const mapIn = {
    nombre_cli: 'NOMBRE_CLI',
    fnacim_cli: 'FNACIM_CLI',
    sexo:       'SEXOOO_CLI',
    domici_cli: 'DOMICI_CLI',
    ciudad_cli: 'CIUDAD_CLI',
    codpos_cli: 'CODPOS_CLI',
    tipdoc_cli: 'TIPDOC_CLI',
    nrodoc_cli: 'NRODOC_CLI',
    cuit_cli:   'CUIT_CLI',
    codzon_cli: 'CODZON_CLI',
    codpla_cli: 'CODPLA_CLI',
    prepag_cli: 'PREPAG_CLI',
    fecing_cli: 'FECING_CLI',
    fecvig_cli: 'FECVIG_CLI',
    observ_cli: 'OBSERV_CLI',
  };

  const data = { ...patch };
  // permitir enviar "sexo": "M"/"F"
  if (data.sexo && !data.SEXOOO_CLI) data.SEXOOO_CLI = sexoCharToDb(data.sexo);

  // pasar from camel_snake to DB col names
  Object.entries(mapIn).forEach(([inKey, col]) => {
    if (data[inKey] !== undefined && data[col] === undefined) {
      data[col] = data[inKey];
    }
  });

  // construir SET
  Object.keys(fields).forEach((col) => {
    if (data[col] !== undefined) {
      setParts.push(`${col} = ?`);
      params.push(data[col] === "" ? null : data[col]);
    }
  });

  if (setParts.length === 0) {
    // nada para actualizar
    return await getSocioByNumero(numeroCli);
  }

  params.push(numeroCli);

  await pool.query(
    `UPDATE maecli SET ${setParts.join(", ")} WHERE NUMERO_CLI = ?`,
    params
  );

  return await getSocioByNumero(numeroCli);
}
// === BAJA DE SOCIO: mover de maecli -> maecli_bajas (con auditoría) ===

/**
 * Mueve un socio activo desde maecli hacia maecli_bajas (auditoría) y lo elimina de maecli.
 * Todo dentro de una transacción atómica.
 * 
 * @param {Object} params
 * @param {number|string} params.numeroCli      - NUMERO_CLI del socio a dar de baja
 * @param {string} params.fechaBaja             - 'YYYY-MM-DD'
 * @param {string} params.motivoBaja            - Motivo (requerido)
 * @param {string|null} [params.obsBaja]        - Observaciones (opcional)
 * @param {string|null} [params.usuarioBaja]    - Usuario que ejecuta (opcional)
 * @returns {Promise<{ok:boolean, numero:number, nombre:string}>}
 */
export async function bajaSocio({
  numeroCli,
  fechaBaja,
  motivoBaja,
  obsBaja = null,
  usuarioBaja = null,
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Traer socio y bloquear fila para evitar condiciones de carrera
    const [rowsSel] = await conn.query(
      `SELECT 
         NUMERO_CLI, NOMBRE_CLI, FNACIM_CLI, SEXOOO_CLI,
         DOMICI_CLI, CIUDAD_CLI, CODPOS_CLI,
         TELFIJ_CLI, TELCEL_CLI,
         TIPDOC_CLI, NRODOC_CLI, EDAD_CLI, CUIT_CLI,
         CODZON_CLI, CODPLA_CLI, CODNIC_CLI,
         PREPAG_CLI, CODPRO_CLI, CODMUT_CLI,
         FECING_CLI, FECVIG_CLI, OBSERV_CLI
       FROM maecli
       WHERE NUMERO_CLI = ?
       FOR UPDATE`,
      [numeroCli]
    );

    if (!rowsSel.length) {
      throw new Error(`No existe el socio NUMERO_CLI=${numeroCli}`);
    }

    // 2) Verificar que no exista ya en maecli_bajas (por la restricción UNIQUE)
    const [dup] = await conn.query(
      `SELECT 1 FROM maecli_bajas WHERE NUMERO_CLI = ? LIMIT 1`,
      [numeroCli]
    );
    if (dup.length) {
      throw new Error(`El socio ${numeroCli} ya figura en maecli_bajas`);
    }

    const s = rowsSel[0];

    // 3) Insertar en maecli_bajas (misma estructura + campos de baja)
    await conn.query(
      `INSERT INTO maecli_bajas (
         NUMERO_CLI, NOMBRE_CLI, FNACIM_CLI, SEXOOO_CLI,
         DOMICI_CLI, CIUDAD_CLI, CODPOS_CLI,
         TELFIJ_CLI, TELCEL_CLI,
         TIPDOC_CLI, NRODOC_CLI, EDAD_CLI, CUIT_CLI,
         CODZON_CLI, CODPLA_CLI, CODNIC_CLI,
         PREPAG_CLI, CODPRO_CLI, CODMUT_CLI,
         FECING_CLI, FECVIG_CLI, OBSERV_CLI,
         FECHA_BAJA, MOTIVO_BAJA, OBS_BAJA, USUARIO_BAJA
       ) VALUES (?,?,?,?, ?,?,?, ?,?, ?,?,?, ?,?,?, ?,?,?, ?,?, ?,?, ?,?,?,?)`,
      [
        s.NUMERO_CLI, s.NOMBRE_CLI, s.FNACIM_CLI, s.SEXOOO_CLI,
        s.DOMICI_CLI, s.CIUDAD_CLI, s.CODPOS_CLI,
        s.TELFIJ_CLI, s.TELCEL_CLI,
        s.TIPDOC_CLI, s.NRODOC_CLI, s.EDAD_CLI, s.CUIT_CLI,
        s.CODZON_CLI, s.CODPLA_CLI, s.CODNIC_CLI,
        s.PREPAG_CLI, s.CODPRO_CLI, s.CODMUT_CLI,
        s.FECING_CLI, s.FECVIG_CLI, s.OBSERV_CLI,
        fechaBaja, motivoBaja, (obsBaja || null), (usuarioBaja || null)
      ]
    );

    // 4) Eliminar de maecli
    await conn.query(
      `DELETE FROM maecli WHERE NUMERO_CLI = ?`,
      [numeroCli]
    );

    await conn.commit();
    return { ok: true, numero: s.NUMERO_CLI, nombre: s.NOMBRE_CLI };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// === BAJA DE GRUPO: mover todos del rango base..base+99 de maecli -> maecli_bajas ===

/**
 * Mueve TODOS los socios del grupo (base..base+99) desde maecli hacia maecli_bajas
 * con auditoría de baja, y luego los elimina de maecli. Todo en UNA transacción.
 *
 * @param {Object} params
 * @param {number|string} params.numeroCli      - NUMERO_CLI de referencia para calcular el base
 * @param {string} params.fechaBaja             - 'YYYY-MM-DD'
 * @param {string} params.motivoBaja            - Motivo (requerido)
 * @param {string|null} [params.obsBaja]        - Observaciones (opcional)
 * @param {string|null} [params.usuarioBaja]    - Usuario que ejecuta (opcional)
 * @returns {Promise<{ok:boolean, base:number, hasta:number, cantidad:number, numeros:number[]}>}
 */
export async function bajaGrupo({
  numeroCli,
  fechaBaja,
  motivoBaja,
  obsBaja = null,
  usuarioBaja = null,
}) {
  const base = Math.floor(Number(String(numeroCli).replace(/\D/g, "")) / 100) * 100;
  const hasta = base + 99;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Traer TODOS los socios del grupo y bloquearlos
    const [rowsSel] = await conn.query(
      `
      SELECT 
        NUMERO_CLI, NOMBRE_CLI, FNACIM_CLI, SEXOOO_CLI,
        DOMICI_CLI, CIUDAD_CLI, CODPOS_CLI,
        TELFIJ_CLI, TELCEL_CLI,
        TIPDOC_CLI, NRODOC_CLI, EDAD_CLI, CUIT_CLI,
        CODZON_CLI, CODPLA_CLI, CODNIC_CLI,
        PREPAG_CLI, CODPRO_CLI, CODMUT_CLI,
        FECING_CLI, FECVIG_CLI, OBSERV_CLI
      FROM maecli
      WHERE NUMERO_CLI BETWEEN ? AND ?
      FOR UPDATE
      `,
      [base, hasta]
    );

    if (!rowsSel.length) {
      throw new Error(`No hay socios activos en el rango ${base}..${hasta}`);
    }

    const numeros = rowsSel.map((r) => r.NUMERO_CLI);

    // 2) Chequear que ninguno de esos números ya esté en maecli_bajas (para evitar violar UNIQUE)
    const [dup] = await conn.query(
      `SELECT NUMERO_CLI FROM maecli_bajas WHERE NUMERO_CLI IN (?)`,
      [numeros]
    );
    if (dup.length) {
      const repetidos = dup.map((d) => d.NUMERO_CLI).sort((a, b) => a - b);
      throw new Error(
        `Algunos números ya están en maecli_bajas: ${repetidos.join(", ")}`
      );
    }

    // 3) Insertar TODOS en maecli_bajas (bulk insert)
    const cols =
      "(NUMERO_CLI, NOMBRE_CLI, FNACIM_CLI, SEXOOO_CLI, " +
      "DOMICI_CLI, CIUDAD_CLI, CODPOS_CLI, " +
      "TELFIJ_CLI, TELCEL_CLI, " +
      "TIPDOC_CLI, NRODOC_CLI, EDAD_CLI, CUIT_CLI, " +
      "CODZON_CLI, CODPLA_CLI, CODNIC_CLI, " +
      "PREPAG_CLI, CODPRO_CLI, CODMUT_CLI, " +
      "FECING_CLI, FECVIG_CLI, OBSERV_CLI, " +
      "FECHA_BAJA, MOTIVO_BAJA, OBS_BAJA, USUARIO_BAJA)";

    const placeholders = rowsSel
      .map(
        () =>
          "(?,?,?,?, ?,?,?, ?,?, ?,?,?, ?,?,?, ?,?,?, ?,?, ?,?,?,?,?)"
      )
      .join(", ");

    const params = [];
    for (const s of rowsSel) {
      params.push(
        s.NUMERO_CLI, s.NOMBRE_CLI, s.FNACIM_CLI, s.SEXOOO_CLI,
        s.DOMICI_CLI, s.CIUDAD_CLI, s.CODPOS_CLI,
        s.TELFIJ_CLI, s.TELCEL_CLI,
        s.TIPDOC_CLI, s.NRODOC_CLI, s.EDAD_CLI, s.CUIT_CLI,
        s.CODZON_CLI, s.CODPLA_CLI, s.CODNIC_CLI,
        s.PREPAG_CLI, s.CODPRO_CLI, s.CODMUT_CLI,
        s.FECING_CLI, s.FECVIG_CLI, s.OBSERV_CLI,
        fechaBaja, motivoBaja, (obsBaja || null), (usuarioBaja || null)
      );
    }

    await conn.query(
      `INSERT INTO maecli_bajas ${cols} VALUES ${placeholders}`,
      params
    );

    // 4) Eliminar TODOS de maecli (rango)
    await conn.query(
      `DELETE FROM maecli WHERE NUMERO_CLI BETWEEN ? AND ?`,
      [base, hasta]
    );

    await conn.commit();

    return { ok: true, base, hasta, cantidad: rowsSel.length, numeros };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
