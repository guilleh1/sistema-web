// src/routes/grupos.js
import { Router } from "express";
import { pool } from "../db.js";
import calcularImporteGrupo from "../domain/calculo.js";
import {
  getIntegrantesGrupo,
  getPlanDelTitular,
  getSistema,
  getEdadesRow,
} from "../services/grupos.service.js";

const router = Router();

/** Helpers ***************************************************************/
function parsePeriodo(qPeriodo) {
  if (!qPeriodo) return new Date();
  const m = /^(\d{2})\/(\d{4})$/.exec(String(qPeriodo).trim());
  if (!m) return new Date();
  const [_, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, 1);
}

/** GET /v2/calcular-grupo/:socio  (usa grupo real de la BD) **************/
router.get("/v2/calcular-grupo/:socio", async (req, res) => {
  try {
    const socioParam = String(req.params.socio || "").trim();
    const q = req.query || {};
    const fechaCorte = parsePeriodo(q.periodo);

    const [integrantes, plan, sistema] = await Promise.all([
      getIntegrantesGrupo(socioParam),
      getPlanDelTitular(socioParam),
      getSistema(),
    ]);

    if (!integrantes || integrantes.length === 0) {
      return res.status(404).json({ ok: false, error: "Grupo no encontrado o sin integrantes" });
    }
    if (!plan) {
      return res.status(404).json({ ok: false, error: "Plan del titular no encontrado" });
    }

    const detalle = await calcularImporteGrupo({
      integrantes,
      plan,
      sistema,
      getEdadesRow,
      fechaCorte,
    });

    return res.json({
      ok: true,
      socio: Number(socioParam),
      plan: { codigo: Number(plan.codigo_pla), nombre: plan.nombre_pla },
      calculo: {
        baseTitular: detalle.baseTitular,
        sumaAdherentes: detalle.sumaAdherentes,
        subtotalSinPrepago: detalle.subtotalSinPrepago,
        ajustePrepago: detalle.ajustePrepago,
        bruto: detalle.total,
        redondeo: detalle.redondeo,
        total: detalle.total,
        recargosAplicados: detalle.recargosAplicados,
        detallePersonas: detalle.detallePersonas,
        reglas: detalle.reglas,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ ok: false, error: e.message || "Error interno" });
  }
});

/** POST /v2/calcular-grupo-draft  (para formulario de altas) *************
 * Body ejemplo:
 * {
 *   "periodo": "11/2025",        // opcional
 *   "planCodigo": 27,            // usar id de /catalogos/planes
 *   "integrantes": [
 *     { "fnacim_cli": "1945-06-26", "prepag_cli": 10000, "tipo": "T" }
 *   ]
 * }
 ***************************************************************************/
router.post("/v2/calcular-grupo-draft", async (req, res) => {
  try {
    const { periodo, planCodigo, integrantes } = req.body || {};
    if (!planCodigo) return res.status(400).json({ ok: false, error: "planCodigo es requerido" });
    if (!Array.isArray(integrantes) || integrantes.length === 0)
      return res.status(400).json({ ok: false, error: "integrantes es requerido" });

    const fechaCorte = parsePeriodo(periodo);

    // Plan
    const [[plan]] = await pool.query(
      `SELECT codigo_pla, nombre_pla, impfij_pla, impadh_pla, desdea_pla
       FROM planes
       WHERE codigo_pla = ?`,
      [planCodigo]
    );
    if (!plan) return res.status(404).json({ ok: false, error: "Plan no encontrado" });

    const sistema = await getSistema();

    const detalle = await calcularImporteGrupo({
      integrantes,
      plan,
      sistema,
      getEdadesRow,
      fechaCorte,
    });

    res.json({
      ok: true,
      data: {
        periodo:
          req.body?.periodo ||
          `${String(fechaCorte.getMonth() + 1).padStart(2, "0")}/${fechaCorte.getFullYear()}`,
        ...detalle,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || "Error interno" });
  }
});

export default router;
