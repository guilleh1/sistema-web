import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";

/* ===== Helpers de fecha (máscara DD/MM/AAAA) ===== */
function isoToMasked(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "";
  }
}
function maskedToISO(masked) {
  if (!masked) return "";
  const digits = masked.replace(/\D+/g, "");
  if (digits.length !== 8) return "";
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4);
  return `${yyyy}-${mm}-${dd}`;
}
function calcEdadISO(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const hoy = new Date();
    let e = hoy.getFullYear() - d.getFullYear();
    const m = hoy.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
    return e >= 0 ? String(e) : "";
  } catch {
    return "";
  }
}
const onlyDigits = (s) => s.replace(/\D+/g, "");

/* ===== Helpers CUIT ===== */
function dvCuit(base11) {
  const pesos = [5,4,3,2,7,6,5,4,3,2];
  const sum = base11.split("").reduce((acc, ch, i) => acc + Number(ch) * pesos[i], 0);
  const mod = sum % 11;
  const dv = 11 - mod;
  if (dv === 11) return 0;
  if (dv === 10) return 9;
  return dv;
}
function calcCUIT(dniDigits, sexo) {
  const dni = String(dniDigits || "").padStart(8, "0");
  const pref = Number(sexo) === 1 ? "27" : "20";
  const base = pref + dni;
  const dv = dvCuit(base);
  return base + String(dv);
}

/* ===== Helpers caret para fechas ===== */
function countDigitsUpTo(masked, pos) {
  let c = 0;
  for (let i = 0; i < Math.min(pos, masked.length); i++) {
    if (/\d/.test(masked[i])) c++;
  }
  return c;
}
function caretPosForDigitIndex(masked, digitIndex) {
  if (digitIndex <= 0) return 0;
  let count = 0;
  for (let i = 0; i < masked.length; i++) {
    if (/\d/.test(masked[i])) {
      count++;
      if (count === digitIndex) return i + 1;
    }
  }
  return masked.length;
}
function maskDDMMYYYYFromDigits(digits) {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
}

/* ==================================================== */

/* Extrae un "numero de socio" desde respuestas heterogéneas */
function extractNumero(rec) {
  if (!rec || typeof rec !== "object") return "";
  const candidates = [
    rec.NUMERO_CLI,
    rec.numero_cli,
    rec.numero,      // por si el backend usa 'numero'
    rec.numeroCli,
    rec.NUMERO,
  ];
  for (const v of candidates) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  if (rec.data) return extractNumero(rec.data);
  return "";
}

/* Convierte cualquier forma de número (e.g. "1390/02") a entero (139002) */
function numeroToInt(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  if (!d) return NaN;
  const n = Number(d);
  return Number.isFinite(n) ? n : NaN;
}

/* Formatea número como base/yy tomando los últimos dos dígitos como sufijo */
function formatNumeroWithSlash(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (d.length <= 2) return String(value || "");
  const base = d.slice(0, -2);
  const suf = d.slice(-2).padStart(2, "0");
  return `${base}/${suf}`;
}

export default function SocioCreate() {
  const navigate = useNavigate();

  // refs para foco
  const refNumero = useRef(null);
  const refNombre = useRef(null);
  const refDni = useRef(null);
  const refFnac = useRef(null);
  const refDom = useRef(null);
  const refCiudad = useRef(null);
  const refZona = useRef(null);
  const refPlan = useRef(null);
  const refSexoM = useRef(null);
  const refSexoF = useRef(null);
  const refFing = useRef(null);
  const refFvig = useRef(null);
  const refPrepag = useRef(null);
  const refObs = useRef(null);

  const [form, setForm] = useState({
    NUMERO_CLI: "",
    NOMBRE_CLI: "",
    TIPDOC_CLI: "DNI",
    NRODOC_CLI: "",
    CUIT_CLI: "",
    sexo: 2,
    FNACIM_txt: "",
    DOMICI_CLI: "",
    CIUDAD_CLI: "",
    CODPOS_CLI: "",
    CODZON_CLI: "",
    CODPLA_CLI: "",
    PREPAG_CLI: "",
    FECING_txt: "",
    FECVIG_txt: "",
    OBSERV_CLI: "",
  });

  /* Precio final del grupo (sin cambios) */
  const [totalGrupo, setTotalGrupo] = useState(null);
  const [calculandoTotal, setCalculandoTotal] = useState(false);
  const [errorCalculo, setErrorCalculo] = useState(null);

  const [zonas, setZonas] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const edad = useMemo(() => calcEdadISO(maskedToISO(form.FNACIM_txt)), [form.FNACIM_txt]);

  /* Último número ingresado */
  const [lastNumero, setLastNumero] = useState("");
  const [lastLoading, setLastLoading] = useState(true);
  const [lastErr, setLastErr] = useState("");

  /* ====== NUEVO: modo adherente/titular y datos del titular base ====== */
  const [isAdherente, setIsAdherente] = useState(false);
  const [titular, setTitular] = useState(null);
  const [titularBase, setTitularBase] = useState(null);
  const [titularLoading, setTitularLoading] = useState(false);
  const [titularErr, setTitularErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [rz, rp] = await Promise.all([
          client.get("/catalogos/zonas"),
          client.get("/catalogos/planes"),
        ]);
        setZonas(rz?.data?.data || []);
        setPlanes(rp?.data?.data || []);
        setTimeout(() => refNumero.current?.focus(), 0);
      } catch (e) {
        setErr(e?.message || "Error cargando catálogos");
      }
    })();
  }, []);

  // Cargar "último ingresado" con fallback robusto a limit=all y cálculo de máximo
  useEffect(() => {
    let cancel = false;
    async function fetchLast() {
      setLastLoading(true);
      setLastErr("");
      try {
        // 1) Endpoint específico si existe
        try {
          const r1 = await client.get(`/socios/ultimo-numero?ts=${Date.now()}`);

          const n1 = extractNumero(r1?.data);
          if (n1) {
            if (!cancel) setLastNumero(String(numeroToInt(n1)));
            return;
          }
        } catch {}

        // 2) Intentos de obtener el último por orden descendente
        const urls = [
          "/socios?limit=1&sort=NUMERO_CLI:desc",
          "/socios?limit=1&sort=numero_cli:desc",
          "/socios?limit=1&sort=numero:desc",
        ];
        for (const u of urls) {
          try {
            const r = await client.get(u);
            const payload = r?.data?.data ?? r?.data;
            let first = null;
            if (Array.isArray(payload)) first = payload[0];
            else if (payload && Array.isArray(payload?.rows)) first = payload.rows[0];
            else first = payload;
            const n = extractNumero(first);
            if (n) {
              if (!cancel) setLastNumero(String(numeroToInt(n)));
              return;
            }
          } catch {}
        }

        // 3) Fallback definitivo: traer todo y calcular el máximo numérico real
        try {
          const rAll = await client.get("/socios?limit=all");
          const raw = rAll?.data?.data ?? rAll?.data ?? [];
          const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.rows) ? raw.rows : []);
          let maxN = -1;
          for (const it of arr) {
            const nRaw = extractNumero(it);
            const n = numeroToInt(nRaw);
            if (Number.isFinite(n) && n > maxN) {
              maxN = n;
            }
          }
          if (maxN >= 0 && !cancel) {
            setLastNumero(String(maxN));
            return;
          }
        } catch {}

        if (!cancel) {
          setLastNumero("");
          setLastErr("No disponible");
        }
      } finally {
        if (!cancel) setLastLoading(false);
      }
    }
    fetchLast();
    return () => { cancel = true; };
  }, []);

  /* ====== NUEVO: observar el número para detectar adherente y cargar titular ====== */
  useEffect(() => {
    const n = numeroToInt(form.NUMERO_CLI);
    if (!Number.isFinite(n)) {
      setIsAdherente(false);
      setTitular(null);
      setTitularBase(null);
      setTitularErr("");
      return;
    }
    const suf = n % 100;
    const adherente = suf >= 1 && suf <= 99;
    setIsAdherente(adherente);

    if (!adherente) {
      // Titular: reactivar edición normal
      setTitular(null);
      setTitularBase(null);
      setTitularErr("");
      return;
    }

    // Adherente: cargar titular base …00
    const base = Math.floor(n / 100) * 100;
    setTitularBase(base);

    let cancel = false;
    (async () => {
      try {
        setTitularLoading(true);
        setTitularErr("");
        const rp = await client.get(`/socios/${base}`);
        const payload = rp?.data?.data ?? rp?.data ?? null;
        const rec = Array.isArray(payload) ? payload[0] : payload;
        if (!rec) throw new Error("Titular no encontrado");
        if (cancel) return;

        // Normalizar campos clave del titular
        const pick = (obj, keys, def = "") => {
          for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null) return obj[k];
          }
          return def;
        };
        const tit = {
          NUMERO_CLI: pick(rec, ["NUMERO_CLI","numero_cli","numero","NUMERO"]),
          DOMICI_CLI: pick(rec, ["DOMICI_CLI","domici_cli","domicilio","DOMICILIO"], ""),
          CIUDAD_CLI: pick(rec, ["CIUDAD_CLI","ciudad_cli","ciudad","CIUDAD"], ""),
          CODPOS_CLI: pick(rec, ["CODPOS_CLI","codpos_cli","cp","CP","codigo_postal"], ""),
          CODZON_CLI: pick(rec, ["CODZON_CLI","codzon_cli","zona","CODZON","id_zona"], ""),
          CODPLA_CLI: pick(rec, ["CODPLA_CLI","codpla_cli","plan","CODPLA","id_plan"], ""),
        };

        setTitular(tit);

        // Completar y bloquear en el form lo que debe copiar del titular
        setForm((prev) => ({
          ...prev,
          DOMICI_CLI: String(tit.DOMICI_CLI ?? ""),
          CIUDAD_CLI: String(tit.CIUDAD_CLI ?? ""),
          CODPOS_CLI: String(tit.CODPOS_CLI ?? ""),
          CODZON_CLI: tit.CODZON_CLI ?? "",
          CODPLA_CLI: tit.CODPLA_CLI ?? "",
          PREPAG_CLI: "", // adherente: sin prepago
        }));
      } catch (e) {
        if (cancel) return;
        console.error("[adherente] No se pudo cargar titular base:", e);
        setTitular(null);
        setTitularErr("Titular base no encontrado. Debe registrarse primero el titular.");
      } finally {
        if (!cancel) setTitularLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [form.NUMERO_CLI]);

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
    setFieldErrors((prev) => ({ ...prev, [k]: "" }));
  }
  function next(ref) {
    if (ref?.current) {
      ref.current.focus();
      ref.current.select?.();
    }
  }

  /* Handlers de desplazamiento (mantengo Tab=Enter donde estaba) */
  function handleNumeroKey(e) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      next(refNombre);
    }
  }
  function handleNombreKey(e) {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      next(refDni);
    }
  }
  function handleDniInput(e) {
    const digits = onlyDigits(e.target.value).slice(0, 8);
    setField("NRODOC_CLI", digits);
    if (digits.length >= 7) {
      const nuevoCuit = calcCUIT(digits, form.sexo || 2);
      setField("CUIT_CLI", nuevoCuit);
    }
    if (digits.length === 8) next(refFnac);
  }
  function handleDomKey(e) {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      next(refCiudad);
    }
  }
  function handleCiudadKey(e) {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      next(refZona);
    }
  }
  function handleZonaChange(e) {
    const v = Number(e.target.value) || "";
    setField("CODZON_CLI", v);
    next(refPlan);
  }
  function handlePlanChange(e) {
    const v = Number(e.target.value) || "";
    setField("CODPLA_CLI", v);
    if (Number(form.sexo) === 1) next(refSexoF);
    else next(refSexoM);
  }
  function handleSexoClick(v) {
    setField("sexo", v);
    const dni = String(form.NRODOC_CLI || "");
    if (dni.length >= 7) {
      const nuevoCuit = calcCUIT(dni, v);
      setField("CUIT_CLI", nuevoCuit);
    }
    next(refFing);
  }

  function handlePrepagKey(e) {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      next(refObs);
    }
  }

  function makeMaskedDateHandlerPreserveCaret(key, nextRef) {
    return (e) => {
      const inputEl = e.target;
      const raw = inputEl.value;
      const beforeDigits = countDigitsUpTo(raw, inputEl.selectionStart ?? raw.length);
      const digits = onlyDigits(raw).slice(0, 8);
      const newMasked = maskDDMMYYYYFromDigits(digits);
      setField(key, newMasked);
      requestAnimationFrame(() => {
        try {
          const pos = caretPosForDigitIndex(newMasked, beforeDigits);
          inputEl.setSelectionRange(pos, pos);
        } catch {}
      });
      if (digits.length === 8 && nextRef?.current) next(nextRef);
    };
  }

  /* Cálculo precio final de grupo (sin cambios) */
  useEffect(() => {
    const planCodigo = String(form.CODPLA_CLI || "").trim();
    const fnacMasked = String(form.FNACIM_txt || "").trim();

    if (!planCodigo || !fnacMasked) {
      setTotalGrupo(null);
      return;
    }

    const fnacISO = maskedToISO(fnacMasked);
    if (!fnacISO) {
      setTotalGrupo(null);
      return;
    }

    const prepag = Number((form.PREPAG_CLI || "").toString().replace(/,/g, ".")) || 0;

    const payload = {
      planCodigo,
      integrantes: [
        {
          numero_cli: Number(form.NUMERO_CLI) || 0,
          nombre_cli: form.NOMBRE_CLI || "",
          fnacim_cli: fnacISO,
          prepag_cli: prepag,
          tipo: "T",
        },
      ],
    };

    let cancelado = false;
    setCalculandoTotal(true);
    setErrorCalculo(null);

    client
      .post("/grupos/v2/calcular-grupo-draft", payload)
      .then((rp) => {
        if (cancelado) return;
        const total = rp?.data?.data?.total;
        setTotalGrupo(typeof total === "number" ? total : null);
      })
      .catch((err) => {
        if (cancelado) return;
        console.error("[calculo-draft]", err);
        setErrorCalculo("No se pudo calcular");
        setTotalGrupo(null);
      })
      .finally(() => {
        if (!cancelado) setCalculandoTotal(false);
      });

    return () => {
      cancelado = true;
    };
  }, [form.CODPLA_CLI, form.PREPAG_CLI, form.FNACIM_txt, form.NUMERO_CLI, form.NOMBRE_CLI]);

  async function onGuardar() {
    let errors = {};
    if (!form.NUMERO_CLI.trim()) errors.NUMERO_CLI = "El número de socio es obligatorio.";
    if (!form.NOMBRE_CLI.trim()) errors.NOMBRE_CLI = "El apellido y nombre es obligatorio.";
    if (!form.FNACIM_txt.trim() || !maskedToISO(form.FNACIM_txt))
      errors.FNACIM_txt = "La fecha de nacimiento es obligatoria (DD/MM/AAAA).";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Detectar si es adherente y validar titular existente
    const n = numeroToInt(form.NUMERO_CLI);
    const suf = Number.isFinite(n) ? (n % 100) : 0;
    const esAdh = Number.isFinite(n) && suf >= 1 && suf <= 99;
    const base = Number.isFinite(n) ? Math.floor(n / 100) * 100 : null;

    if (esAdh) {
      if (!titular || String(extractNumero(titular)) !== String(base)) {
        alert(`Primero debe registrarse el titular ${formatNumeroWithSlash(base)}.`);
        return;
      }
    }

    if (!window.confirm("¿Crear nuevo socio?")) return;
    setSaving(true);
    setErr("");

    try {
      let prepagoNum = null;
      if (form.PREPAG_CLI !== "" && form.PREPAG_CLI !== "-") {
        const nn = Number(form.PREPAG_CLI);
        prepagoNum = Number.isFinite(nn) ? nn : null;
      }

      let payload = {
        ...form,
        SEXOOO_CLI: Number(form.sexo) || 2,
        FNACIM_CLI: maskedToISO(form.FNACIM_txt) || null,
        FECING_CLI: maskedToISO(form.FECING_txt) || null,
        FECVIG_CLI: maskedToISO(form.FECVIG_txt) || null,
        PREPAG_CLI: prepagoNum,
      };

            // Forzar campos desde titular si es adherente
      if (esAdh && titular) {
        const codzon = Number(titular.CODZON_CLI ?? form.CODZON_CLI) || 0;
        const codpla = Number(titular.CODPLA_CLI ?? form.CODPLA_CLI) || 0;

        payload = {
        ...payload,
        // hereda del titular (bloqueados en UI):
        DOMICI_CLI: titular.DOMICI_CLI ?? form.DOMICI_CLI,
        CIUDAD_CLI: titular.CIUDAD_CLI ?? form.CIUDAD_CLI,
        CODPOS_CLI: titular.CODPOS_CLI ?? form.CODPOS_CLI,
        CODZON_CLI: codzon,              // numérico
        CODPLA_CLI: codpla,              // numérico
        PREPAG_CLI: 0,                   // adherente sin prepago (evita NULL y 500)
        TIPDOC_CLI: payload.TIPDOC_CLI || "DNI", // por si viene vacío
        };
      }


      await client.post("/socios", payload);
      alert("Socio creado correctamente.");
      navigate("/socios");
    } catch (e) {
      if (e?.response?.status === 409) {
        const field = e.response.data?.field;
        const message = e.response.data?.message || "Dato duplicado.";
        setFieldErrors((prev) => ({ ...prev, [field]: message }));
      } else {
        setErr(e?.response?.data?.message || e?.message || "Error creando socio");
      }
    } finally {
      setSaving(false);
    }
  }

  function onCancelar() {
    if (!window.confirm("¿Cancelar el alta?")) return;
    navigate("/socios");
  }

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-semibold mb-1 flex flex-wrap items-center gap-3">
        <span>Alta de Afiliado N°</span>
        <input
          ref={refNumero}
          className={`ml-2 w-32 border rounded px-3 py-1.5 align-middle ${
            fieldErrors.NUMERO_CLI ? "border-red-500" : ""
          }`}
          placeholder="Ej: 13800"
          value={form.NUMERO_CLI}
          onChange={(e) => setField("NUMERO_CLI", e.target.value)}
          onKeyDown={handleNumeroKey}
        />
        {/* Último ingresado (solo lectura) */}
        <span className="ml-4 text-sm text-gray-600 flex items-center gap-2">
          <span>Último ingresado:</span>
          <input
            tabIndex={-1}
            readOnly
            className="w-32 border rounded px-2 py-1 bg-gray-50"
            value={
              lastLoading
                ? "…"
                : (lastNumero
                    ? formatNumeroWithSlash(lastNumero)
                    : (lastErr ? "—" : ""))
            }
            title={lastErr || ""}
          />
        </span>
      </h2>
      {fieldErrors.NUMERO_CLI && <div className="text-red-600 text-sm">{fieldErrors.NUMERO_CLI}</div>}
      {err && <div className="text-red-600 mb-3">{err}</div>}
      {isAdherente && titularErr && (
        <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
          {titularErr} {titularBase ? `(Base: ${formatNumeroWithSlash(titularBase)})` : ""}
        </div>
      )}

      {/* LÍNEA 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm">Apellido, Nombre</span>
          <input
            ref={refNombre}
            className={`w-full border rounded px-3 py-2 ${fieldErrors.NOMBRE_CLI ? "border-red-500" : ""}`}
            value={form.NOMBRE_CLI}
            onChange={(e) => setField("NOMBRE_CLI", e.target.value)}
            onKeyDown={handleNombreKey}
          />
          {fieldErrors.NOMBRE_CLI && <div className="text-red-600 text-sm">{fieldErrors.NOMBRE_CLI}</div>}
        </label>

        <label className="block">
          <span className="text-sm">Domicilio</span>
          <input
            ref={refDom}
            className="w-full border rounded px-3 py-2"
            value={form.DOMICI_CLI}
            onChange={(e) => setField("DOMICI_CLI", e.target.value)}
            onKeyDown={handleDomKey}
            disabled={isAdherente} /* adherente: copia del titular */
          />
        </label>
      </div>

      {/* LÍNEA 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">Tipo Doc</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.TIPDOC_CLI}
              onChange={(e) => setField("TIPDOC_CLI", e.target.value)}
              disabled={isAdherente} /* adherente: no editable */
            />
          </label>

          <label className="block">
            <span className="text-sm">Nº Doc</span>
            <input
              ref={refDni}
              inputMode="numeric"
              className={`w-full border rounded px-3 py-2 ${fieldErrors.NRODOC_CLI ? "border-red-500" : ""}`}
              value={form.NRODOC_CLI}
              onChange={handleDniInput}
            />
            {fieldErrors.NRODOC_CLI && <div className="text-red-600 text-sm">{fieldErrors.NRODOC_CLI}</div>}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">Ciudad</span>
            <input
              ref={refCiudad}
              className="w-full border rounded px-3 py-2"
              value={form.CIUDAD_CLI}
              onChange={(e) => setField("CIUDAD_CLI", e.target.value)}
              onKeyDown={handleCiudadKey}
              disabled={isAdherente} /* adherente: copia del titular */
            />
          </label>

          <label className="block">
            <span className="text-sm">CUIT</span>
            <input
              readOnly
              className="w-full border rounded px-3 py-2 bg-gray-50"
              value={form.CUIT_CLI}
            />
          </label>
        </div>
      </div>

      {/* LÍNEA 3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">F. Nacimiento</span>
            <input
              ref={refFnac}
              type="text"
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              className={`w-full border rounded px-3 py-2 ${fieldErrors.FNACIM_txt ? "border-red-500" : ""}`}
              value={form.FNACIM_txt}
              onChange={makeMaskedDateHandlerPreserveCaret("FNACIM_txt", refDom)}
            />
            {fieldErrors.FNACIM_txt && <div className="text-red-600 text-sm">{fieldErrors.FNACIM_txt}</div>}
          </label>

          <label className="block">
            <span className="text-sm">Edad</span>
            <input className="w-full border rounded px-3 py-2 bg-gray-50" value={edad} readOnly />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">Zona</span>
            <select
              ref={refZona}
              className="w-full border rounded px-3 py-2"
              value={form.CODZON_CLI}
              onChange={handleZonaChange}
              disabled={isAdherente} /* adherente: copia del titular */
            >
              <option value="">Seleccionar…</option>
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm">Plan</span>
            <select
              ref={refPlan}
              className="w-full border rounded px-3 py-2"
              value={form.CODPLA_CLI}
              onChange={handlePlanChange}
              disabled={isAdherente} /* adherente: copia del titular */
            >
              <option value="">Seleccionar…</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* SEXO */}
      <div className="mt-4">
        <span className="text-sm block mb-1">Sexo</span>
        <div className="flex items-center gap-6">
          <label className="inline-flex items-center gap-2">
            <input
              ref={refSexoM}
              type="radio"
              name="sexo"
              value={2}
              checked={Number(form.sexo) === 2}
              onChange={() => handleSexoClick(2)}
            />
            <span>Masculino</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              ref={refSexoF}
              type="radio"
              name="sexo"
              value={1}
              checked={Number(form.sexo) === 1}
              onChange={() => handleSexoClick(1)}
            />
            <span>Femenino</span>
          </label>
        </div>
      </div>

      {/* LÍNEA 4: Fechas ingreso/vigencia */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <label className="block">
          <span className="text-sm">F. Ingreso</span>
          <input
            ref={refFing}
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/AAAA"
            className="w-full border rounded px-3 py-2"
            value={form.FECING_txt}
            onChange={makeMaskedDateHandlerPreserveCaret("FECING_txt", refFvig)}
          />
        </label>

        <label className="block">
          <span className="text-sm">F. Vigencia</span>
          <input
            ref={refFvig}
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/AAAA"
            className="w-full border rounded px-3 py-2"
            value={form.FECVIG_txt}
            onChange={makeMaskedDateHandlerPreserveCaret("FECVIG_txt", refPrepag)}
          />
        </label>
      </div>

      {/* PREPAGO */}
      <div className="mt-4 max-w-md">
        <label className="block">
          <span className="text-sm">Prepago</span>
          <input
            ref={refPrepag}
            className="w-full border rounded px-3 py-2"
            value={form.PREPAG_CLI}
            onChange={(e) => setField("PREPAG_CLI", e.target.value)}
            onKeyDown={handlePrepagKey}   /* ← Enter/Tab → Observaciones */
            inputMode="numeric"
            disabled={isAdherente} /* adherente: sin prepago */
          />
        </label>
      </div>

      {/* PRECIO FINAL DEL GRUPO (solo lectura) */}
      <div className="mt-4 max-w-md">
        <label className="block">
          <span className="text-sm">Precio final del grupo</span>
          <input
            className="w-full border rounded px-3 py-2 bg-gray-100"
            value={
              totalGrupo === null
                ? (calculandoTotal ? "Calculando..." : "")
                : new Intl.NumberFormat("es-AR", {
                    style: "currency",
                    currency: "ARS",
                    maximumFractionDigits: 0,
                  }).format(totalGrupo)
            }
            readOnly
            aria-invalid={!!errorCalculo}
            title={errorCalculo || ""}
          />
        </label>
      </div>

      {/* OBSERVACIONES */}
      <div className="mt-4">
        <label className="block">
          <span className="text-sm">Observaciones</span>
          <textarea
            ref={refObs}
            rows={4}
            className="w-full border rounded px-3 py-2"
            value={form.OBSERV_CLI}
            onChange={(e) => setField("OBSERV_CLI", e.target.value)}
          />
        </label>
      </div>

      {/* BOTONES */}
      <div className="flex gap-2 mt-5">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2"
          onClick={onGuardar}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button className="border rounded px-4 py-2" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
