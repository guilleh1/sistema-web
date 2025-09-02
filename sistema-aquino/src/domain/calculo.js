// src/domain/calculo.js

// ===== Utilidades
export function calcularEdad(fechaNacISO, refDate = new Date()) {
  if (!fechaNacISO) return 0;
  const fn = new Date(fechaNacISO);
  if (Number.isNaN(fn.getTime())) return 0;

  // edad a FECHA DE CORTE (refDate): MM/AAAA -> usamos día 1 de ese mes
  let edad = refDate.getFullYear() - fn.getFullYear();
  const m = refDate.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < fn.getDate())) edad--;

  return edad < 0 ? 0 : edad;
}

// En planes de importe fijo puede haber recargo por edad; en tabla NO se aplica.
export function recargoMayor(edad, recaed_sis, recaim_sis) {
  if (recaed_sis == null || recaim_sis == null) return 0;
  return edad > Number(recaed_sis) ? Number(recaim_sis || 0) : 0;
}

/**
 * Cálculo exacto:
 * - Plan por TABLA: toma imptit_eda/impadh_eda (sin recargo).
 * - Plan IMPORTE FIJO: precio fijo + recargo si excede edad sistema.
 * - desdeAdh define desde qué adherente suma (p.ej., 2 -> 01 no suma).
 * - PREPAGO (prepag_cli) se suma/resta una sola vez al final (suma total).
 * - SIN redondeo.
 * - Usa edad a la FECHA DE CORTE `fechaCorte` (si no viene, usa hoy).
 */
async function calcularImporteGrupo({ integrantes, plan, sistema, getEdadesRow, fechaCorte = new Date() }) {
  const importeFijo = Number(plan.impfij_pla) === 1;
  const desdeAdh = Number(plan.desdea_pla || 0);

  let baseTitular = 0;
  let sumaAdherentes = 0;
  let recargosAplicados = 0;
  let prepagoTotal = 0;

  const detallePersonas = [];

  for (const per of integrantes) {
    const numero = Number(per.numero_cli);
    const cat = numero % 100; // 0 titular; 1..99 adherentes
    const rol = cat === 0 ? "TITULAR" : "ADHERENTE";
    const edad = calcularEdad(per.fnacim_cli, fechaCorte);
    const prepag = Number(per.prepag_cli || 0);
    prepagoTotal += prepag;

    let fuente = "";
    let filaHasta = null;
    let base = 0;
    let rec = 0;
    let motivo = "";

    if (cat === 0) {
      if (importeFijo) {
        fuente = "fijo";
        base = Number(plan.precio_pla || 0);
        rec = recargoMayor(edad, sistema.recaed_sis, sistema.recaim_sis);
      } else {
        fuente = "tabla";
        const e = await getEdadesRow(plan.codigo_pla, edad);
        base = Number(e?.imptit_eda || 0);
        filaHasta = e?.hastae_eda ?? null;
        rec = 0;
      }
    } else {
      if (cat >= desdeAdh) {
        if (importeFijo) {
          fuente = "fijo";
          base = Number(plan.impadh_pla || 0);
          rec = recargoMayor(edad, sistema.recaed_sis, sistema.recaim_sis);
        } else {
          fuente = "tabla";
          const e = await getEdadesRow(plan.codigo_pla, edad);
          base = Number(e?.impadh_eda || 0);
          filaHasta = e?.hastae_eda ?? null;
          rec = 0;
        }
      } else {
        motivo = `No computa (cat ${cat} < desdeAdh ${desdeAdh})`;
      }
    }

    const subtotalPersona = motivo ? 0 : base + rec;

    if (cat === 0) baseTitular = subtotalPersona;
    else sumaAdherentes += subtotalPersona;

    recargosAplicados += rec;

    detallePersonas.push({
      numero, rol, cat, edad,
      fuente, filaHasta,
      base, recargo: rec,
      subtotal: subtotalPersona,
      prepag_cli: prepag,
      motivo
    });
  }

  const subtotalSinPrepago = baseTitular + sumaAdherentes;
  const bruto = subtotalSinPrepago + prepagoTotal; // PREPAGO al final
  const redondeo = 0;
  const total = bruto;

  return {
    baseTitular,
    sumaAdherentes,
    subtotalSinPrepago,
    ajustePrepago: prepagoTotal,
    bruto,
    redondeo,
    total,
    recargosAplicados,
    detallePersonas,
    reglas: {
      plan: { codigo: Number(plan.codigo_pla), tipo: importeFijo ? "fijo" : "tabla", desdeAdh },
      recargo: { aplicaEn: "fijo", desdeEdad: Number(sistema.recaed_sis ?? 0), importe: Number(sistema.recaim_sis ?? 0) },
      // 🔁 Ajustado al criterio que pediste:
      criterioEdades: "primer tramo con hastae_eda >= edad",
      prepago: "ajuste final del grupo (suma de prepag_cli)",
      fechaCorte: fechaCorte.toISOString().slice(0,10)
    }
  };
}

export default calcularImporteGrupo;
