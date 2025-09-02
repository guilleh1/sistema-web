// src/routes/grupos.v2.calc.js
import { Router } from "express";
import calcularImporteGrupo from "../domain/calculo.js";
import {
  getIntegrantesGrupo,
  getPlanDelTitular,
  getSistema,
  getEdadesRow,
} from "../services/grupos.service.js";

const router = Router();

/** Valida MM/YYYY y devuelve Date en día 1 del mes */
function parsePeriodo(qPeriodo) {
  if (!qPeriodo) return new Date();
  const m = /^(\d{2})\/(\d{4})$/.exec(String(qPeriodo).trim());
  if (!m) return new Date();
  const [_, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, 1);
}
function esPeriodoValido(p) {
  return /^(\d{2})\/(\d{4})$/.test(String(p || "").trim());
}

/**
 * GET /grupos/v2/calc?socio=200&periodo=MM/YYYY
 * Devuelve el TOTAL real del grupo usando tu dominio + services.
 */
router.get("/calc", async (req, res) => {
  try {
    const socioParam = String(req.query.socio || req.query.numero || "").trim();
    const periodo = String(req.query.periodo || "").trim() || null;

    if (!socioParam) {
      return res.status(400).json({ ok: false, error: "Falta ?socio" });
    }
    if (periodo && !esPeriodoValido(periodo)) {
      return res.status(400).json({ ok: false, error: "Periodo inválido. Formato MM/YYYY" });
    }

    const fechaCorte = parsePeriodo(periodo);

    // Traemos todo lo necesario en paralelo
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

    // Cálculo central (tu lógica)
    const detalle = await calcularImporteGrupo({
      integrantes,
      plan,
      sistema,
      getEdadesRow,
      fechaCorte,
    });

    const mm = String((fechaCorte.getMonth() + 1)).padStart(2, "0");
    const yyyy = fechaCorte.getFullYear();

    return res.json({
      ok: true,
      data: {
        total: Number(detalle.total || 0),          // <- lo que consume la UI
        periodo: `${mm}/${yyyy}`,
        socio: Number(socioParam),
        // opcional: te dejo info útil por si querés mostrar un breakdown después
        baseTitular: detalle.baseTitular,
        sumaAdherentes: detalle.sumaAdherentes,
        ajustePrepago: detalle.ajustePrepago,
        recargosAplicados: detalle.recargosAplicados,
        items: detalle.detallePersonas || [],
      },
    });
  } catch (e) {
    console.error("[/grupos/v2/calc] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Error interno" });
  }
});

export default router;
