// src/routes/bajas.js
import { Router } from "express";
import { bajaSocio } from "../services/socios.service.js";
import { bajaGrupo } from "../services/socios.service.js";

const router = Router();

/**
 * POST /socios/:numero/baja
 * Body:
 *  - fecha_baja: 'YYYY-MM-DD' (opcional; si no viene, hoy)
 *  - motivo: string (obligatorio)
 *  - observaciones: string (opcional)
 *  - usuario: string (opcional)
 *  - alcance: "socio" | "grupo" (opcional; default "socio")
 */
router.post("/:numero/baja", async (req, res, next) => {
  try {
    const numeroRaw = req.params.numero;
    const numeroCli = Number.parseInt(String(numeroRaw).replace(/\D/g, ""), 10);
    if (!Number.isFinite(numeroCli)) {
      return res.status(400).json({ ok: false, message: "NUMERO_CLI inválido." });
    }

    const { fecha_baja, motivo, observaciones, usuario, alcance } = req.body || {};

    if (!motivo || !String(motivo).trim()) {
      return res.status(400).json({ ok: false, message: "El motivo es obligatorio." });
    }

    // Fecha por defecto: hoy (ISO)
    const hoy = new Date();
    const isoHoy = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}-${String(hoy.getDate()).padStart(2,"0")}`;
    const fechaBaja = (fecha_baja && /^\d{4}-\d{2}-\d{2}$/.test(fecha_baja)) ? fecha_baja : isoHoy;

    const alcanceUse = (String(alcance || "socio").toLowerCase() === "grupo") ? "grupo" : "socio";

    if (alcanceUse === "grupo") {
      const result = await bajaGrupo({
        numeroCli,
        fechaBaja,
        motivoBaja: String(motivo).trim(),
        obsBaja: observaciones ? String(observaciones) : null,
        usuarioBaja: usuario ? String(usuario) : null,
      });
      return res.json({ ok: true, tipo: "grupo", ...result });
    } else {
      const result = await bajaSocio({
        numeroCli,
        fechaBaja,
        motivoBaja: String(motivo).trim(),
        obsBaja: observaciones ? String(observaciones) : null,
        usuarioBaja: usuario ? String(usuario) : null,
      });
      return res.json({ ok: true, tipo: "socio", ...result });
    }
  } catch (err) {
    // Errores conocidos
    if (/No existe el socio/.test(err.message)) {
      return res.status(404).json({ ok: false, message: err.message });
    }
    if (/ya figura en maecli_bajas/.test(err.message)) {
      return res.status(409).json({ ok: false, message: err.message });
    }
    if (/No hay socios activos en el rango/.test(err.message)) {
      return res.status(404).json({ ok: false, message: err.message });
    }
    if (/Algunos números ya están en maecli_bajas/.test(err.message)) {
      return res.status(409).json({ ok: false, message: err.message });
    }
    next(err);
  }
});

export default router;
