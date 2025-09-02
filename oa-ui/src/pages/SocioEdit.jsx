// oa-ui/src/pages/SocioEdit.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  return `${yyyy}-${mm}-${dd}`; // ISO yyyy-mm-dd
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

/* ===== Helpers CUIT =====
   SEXOOO_CLI: 1 = Femenino → prefijo 27
               2 = Masculino → prefijo 20                                   */
function dvCuit(base11 /* string de 10 dígitos */) {
  const pesos = [5,4,3,2,7,6,5,4,3,2];
  const sum = base11.split("").reduce((acc, ch, i) => acc + Number(ch) * pesos[i], 0);
  const mod = sum % 11;
  const dv = 11 - mod;
  if (dv === 11) return 0;
  if (dv === 10) return 9;
  return dv;
}
function calcCUIT(dniDigits, sexo /*1=F,2=M*/) {
  const dni = String(dniDigits || "").padStart(8, "0");
  const pref = Number(sexo) === 1 ? "27" : "20";
  const base = pref + dni; // 10 dígitos
  const dv = dvCuit(base);
  return base + String(dv);
}

/* ===== Helpers caret para fechas con máscara ===== */
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
      if (count === digitIndex) return i + 1; // después de ese dígito
    }
  }
  return masked.length;
}
function maskDDMMYYYYFromDigits(digits) {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
}

/* ===== Helpers precio grupo ===== */
const fmtARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
function periodoActualMMYYYY() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
}

/* ==================================================== */

export default function SocioEdit() {
  const { numeroCli } = useParams();
  const navigate = useNavigate();

  // refs para foco
  const refNumero = useRef(null); // Número de socio editable completo
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
  const refCel = useRef(null); // NUEVO: Celular

  const [orig, setOrig] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [zonas, setZonas] = useState([]);
  const [planes, setPlanes] = useState([]);

  // Estado para el precio del grupo
  const [precioGrupo, setPrecioGrupo] = useState(null);
  const [precioLoading, setPrecioLoading] = useState(false);
  const [precioErr, setPrecioErr] = useState("");

  // Validación simple del número
  const [numeroError, setNumeroError] = useState("");

  // Edad
  const edad = useMemo(() => calcEdadISO(maskedToISO(form.FNACIM_txt)), [form.FNACIM_txt]);
  const changed = useMemo(() => JSON.stringify(orig) !== JSON.stringify(form), [orig, form]);

  /* Cargar socio + catálogos */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [rz, rp, socioResp] = await Promise.all([
          client.get("/catalogos/zonas"),
          client.get("/catalogos/planes"),
          client.get(`/socios/${numeroCli}`),
        ]);
        setZonas(rz?.data?.data || []);
        setPlanes(rp?.data?.data || []);

        const r = socioResp?.data?.data || {};
        const numero = String(r.NUMERO_CLI ?? ""); // editable como string

        setOrig({ ...r, _numero_fmt: numero });

        setForm({
          ...r,
          _numero_fmt: numero, // para mostrar en el título
          // SEXOOO_CLI: 1 = Femenino, 2 = Masculino (corregido)
          sexo: r?.SEXOOO_CLI ?? 2,
          // Fechas en máscara DD/MM/AAAA para la UI
          FNACIM_txt: isoToMasked(r?.FNACIM_CLI),
          FECING_txt: isoToMasked(r?.FECING_CLI),
          FECVIG_txt: isoToMasked(r?.FECVIG_CLI),
          // Prepago como string (permite signo)
          PREPAG_CLI: r?.PREPAG_CLI ?? "",
          // Número y Celular
          NUMERO_CLI: numero,
          TELCEL_CLI: r?.TELCEL_CLI ?? "",
        });

        setTimeout(() => refNombre.current?.focus(), 0);
      } catch (e) {
        setErr(e?.message || "Error cargando socio");
      } finally {
        setLoading(false);
      }
    })();
  }, [numeroCli]);

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }
  function next(ref) {
    if (ref?.current) {
      ref.current.focus();
      ref.current.select?.();
    }
  }

  /* ====== Número de socio 100% editable ====== */
  function handleNumeroChange(e) {
    const digits = onlyDigits(e.target.value);
    setField("NUMERO_CLI", digits);   // guardamos como string de dígitos
    setField("_numero_fmt", digits);  // para el título
    setNumeroError(digits ? "" : "El número no puede estar vacío");
  }
  function handleNumeroBlur() {
    const digits = onlyDigits(form.NUMERO_CLI || "");
    if (!digits) {
      setNumeroError("El número no puede estar vacío");
    } else {
      setNumeroError("");
      setField("NUMERO_CLI", digits);
      setField("_numero_fmt", digits);
    }
  }

  /* Handlers generales */
  function handleNombreKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      next(refDni);
    }
  }

  // DNI: solo dígitos; al llegar a 8 pasa a FNAC y recalcula CUIT
  function handleDniInput(e) {
    const digits = onlyDigits(e.target.value).slice(0, 8);
    setField("NRODOC_CLI", digits);

    if (digits.length >= 7) {
      const nuevoCuit = calcCUIT(digits, form.sexo || 2);
      setField("CUIT_CLI", nuevoCuit);
    }
    if (digits.length === 8) next(refFnac);
  }

  // Máscara DD/MM/AAAA que respeta caret y avanza SOLO con 8 dígitos
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

      if (digits.length === 8 && nextRef?.current) {
        next(nextRef);
      }
    };
  }

  function handleDomKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      next(refCiudad);
    }
  }
  function handleCiudadKey(e) {
    if (e.key === "Enter") {
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

  // Sexo: set y recalcular CUIT con DNI actual (si 7+ dígitos), luego foco a F. Ingreso
  function handleSexoClick(v) {
    setField("sexo", v); // 1=F, 2=M
    const dni = String(form.NRODOC_CLI || "");
    if (dni.length >= 7) {
      const nuevoCuit = calcCUIT(dni, v);
      setField("CUIT_CLI", nuevoCuit);
    }
    next(refFing);
  }

  // Prepago: permite signo negativo y dígitos; normaliza en blur
  function handlePrepagChange(e) {
    const s = e.target.value;
    if (/^-?\d*$/.test(s)) {
      setField("PREPAG_CLI", s);
    }
  }
  function handlePrepagBlur(e) {
    let s = e.target.value.trim();
    if (s === "-" || s === "") { setField("PREPAG_CLI", ""); return; }
    const neg = s.startsWith("-");
    const digits = onlyDigits(s).replace(/^0+(?=\d)/, "");
    setField("PREPAG_CLI", (neg ? "-" : "") + (digits === "" ? "0" : digits));
  }
  function handlePrepagKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      next(refObs);
    }
  }

  /* ===== Precio final del grupo (endpoint fijo /grupos/v2/calc) ===== */
  async function fetchPrecioGrupo(signal) {
    try {
      setPrecioErr("");
      setPrecioLoading(true);

      const periodo = periodoActualMMYYYY();
      const resp = await client.get("/grupos/v2/calc", {
        params: { socio: Number(numeroCli), periodo },
        signal,
      });

      const total =
        resp?.data?.data?.total ??
        resp?.data?.total ??
        resp?.data?.precioTotal ??
        null;

      if (total == null) throw new Error("Respuesta sin 'total'");
      setPrecioGrupo(total);
    } catch (e) {
      if (e?.name === "CanceledError") return;
      setPrecioErr(e?.response?.data?.error || e?.message || "No se pudo calcular el precio del grupo");
      setPrecioGrupo(null);
    } finally {
      setPrecioLoading(false);
    }
  }

  // Debounce: recalcular al cambiar plan, zona o prepago (impacta en el cálculo)
  useEffect(() => {
    if (!numeroCli) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => { fetchPrecioGrupo(ctrl.signal); }, 500);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [numeroCli, form.CODPLA_CLI, form.CODZON_CLI, form.PREPAG_CLI]);

  // También calculamos una vez al cargar (cuando orig ya está)
  useEffect(() => {
    if (!orig) return;
    const ctrl = new AbortController();
    fetchPrecioGrupo(ctrl.signal);
    return () => ctrl.abort();
  }, [orig]);

  /* ===== Guardar / Salir ===== */
  async function onGuardar() {
    if (!window.confirm("¿Guardar los cambios?")) return;
    setSaving(true);
    setErr("");
    try {
      // Validación mínima del número (debe tener al menos 1 dígito)
      const numeroDigits = onlyDigits(form.NUMERO_CLI || "");
      if (!numeroDigits) {
        alert("Número de socio inválido. Debe contener dígitos.");
        setSaving(false);
        refNumero.current?.focus();
        return;
      }

      let prepagoNum = null;
      if (form.PREPAG_CLI !== "" && form.PREPAG_CLI !== "-") {
        const n = Number(form.PREPAG_CLI);
        prepagoNum = Number.isFinite(n) ? n : null;
      }

      const payload = {
        NUMERO_CLI: Number(numeroDigits), // número elegido
        NOMBRE_CLI: form.NOMBRE_CLI,
        TIPDOC_CLI: form.TIPDOC_CLI,
        NRODOC_CLI: form.NRODOC_CLI,
        CUIT_CLI: form.CUIT_CLI,
        SEXOOO_CLI: Number(form.sexo) || 2,
        FNACIM_CLI: maskedToISO(form.FNACIM_txt) || null,
        DOMICI_CLI: form.DOMICI_CLI,
        CIUDAD_CLI: form.CIUDAD_CLI,
        TELCEL_CLI: form.TELCEL_CLI ?? "", // NUEVO: Celular
        CODPOS_CLI: form.CODPOS_CLI,
        CODZON_CLI: form.CODZON_CLI,
        CODPLA_CLI: form.CODPLA_CLI,
        PREPAG_CLI: prepagoNum,
        FECING_CLI: maskedToISO(form.FECING_txt) || null,
        FECVIG_CLI: maskedToISO(form.FECVIG_txt) || null,
        OBSERV_CLI: form.OBSERV_CLI,
      };

      const { data } = await client.put(`/socios/${numeroCli}`, payload);
      alert("Cambios guardados.");

      // Actualizo orig con el nuevo número y display
      const nuevoNumero = String(data?.data?.NUMERO_CLI ?? numeroDigits);
      setOrig(
        data?.data
          ? { ...data.data, _numero_fmt: nuevoNumero }
          : { ...form, NUMERO_CLI: nuevoNumero, _numero_fmt: nuevoNumero }
      );

      navigate(-1);
    } catch (e) {
      setErr(e?.message || "Error guardando cambios");
    } finally {
      setSaving(false);
    }
  }

  function onSalir() {
    if (changed && !window.confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) return;
    navigate(-1);
  }

  if (loading) return <div className="p-4">Cargando…</div>;
  if (err) return <div className="p-4 text-red-600">Error: {err}</div>;
  if (!orig) return <div className="p-4">No encontrado.</div>;

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-semibold mb-1">Editar afiliado {form._numero_fmt}</h2>

      {/* Número de socio: 100% editable */}
      <div className="max-w-xs mb-4">
        <label className="block">
          <span className="text-sm">Número de socio</span>
          <input
            ref={refNumero}
            tabIndex={0}
            className={`w-full border rounded px-3 py-2 ${numeroError ? "border-red-500" : ""}`}
            value={form.NUMERO_CLI || ""}
            onChange={handleNumeroChange}
            onBlur={handleNumeroBlur}
            placeholder="Escribí el número libremente (solo dígitos)"
            inputMode="numeric"
          />
        </label>
        {numeroError && <div className="text-xs text-red-600 mt-1">{numeroError}</div>}
      </div>

      {/* LÍNEA 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm">Apellido, Nombre</span>
          <input
            ref={refNombre}
            tabIndex={1}
            className="w-full border rounded px-3 py-2"
            value={form.NOMBRE_CLI || ""}
            onChange={(e) => setField("NOMBRE_CLI", e.target.value)}
            onKeyDown={handleNombreKey}
          />
        </label>

        <label className="block">
          <span className="text-sm">Domicilio</span>
          <input
            ref={refDom}
            tabIndex={4}
            className="w-full border rounded px-3 py-2"
            value={form.DOMICI_CLI || ""}
            onChange={(e) => setField("DOMICI_CLI", e.target.value)}
            onKeyDown={handleDomKey}
          />
        </label>
      </div>

      {/* LÍNEA 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">Tipo Doc</span>
            <input
              tabIndex={0} // no altera el flujo principal
              className="w-full border rounded px-3 py-2"
              value={form.TIPDOC_CLI || ""}
              onChange={(e) => setField("TIPDOC_CLI", e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm">Nº Doc</span>
            <input
              ref={refDni}
              tabIndex={2}
              inputMode="numeric"
              className="w-full border rounded px-3 py-2"
              value={form.NRODOC_CLI || ""}
              onChange={handleDniInput}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">Ciudad</span>
            <input
              ref={refCiudad}
              tabIndex={5}
              className="w-full border rounded px-3 py-2"
              value={form.CIUDAD_CLI || ""}
              onChange={(e) => setField("CIUDAD_CLI", e.target.value)}
              onKeyDown={handleCiudadKey}
            />
          </label>

          <label className="block">
            <span className="text-sm">CUIT</span>
            <input
              tabIndex={-1} // fuera del flujo de TAB
              readOnly
              className="w-full border rounded px-3 py-2 bg-gray-50"
              value={form.CUIT_CLI || ""}
            />
          </label>
        </div>
      </div>

      {/* CELULAR (nuevo bloque, sin alterar el flujo principal) */}
      <div className="mt-4 max-w-md">
        <label className="block">
          <span className="text-sm">Celular</span>
          <input
            ref={refCel}
            tabIndex={0} // no rompe tu orden de tab
            className="w-full border rounded px-3 py-2"
            value={form.TELCEL_CLI || ""}
            onChange={(e) => setField("TELCEL_CLI", e.target.value)}
            placeholder="Ej: 351 123-4567"
            inputMode="tel"
          />
        </label>
      </div>

      {/* LÍNEA 3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">F. Nacimiento</span>
            <input
              ref={refFnac}
              tabIndex={3}
              type="text"
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              className="w-full border rounded px-3 py-2"
              value={form.FNACIM_txt || ""}
              onChange={makeMaskedDateHandlerPreserveCaret("FNACIM_txt", refDom)}
            />
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
              tabIndex={6}
              className="w-full border rounded px-3 py-2"
              value={form.CODZON_CLI ?? ""}
              onChange={handleZonaChange}
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
              tabIndex={7}
              className="w-full border rounded px-3 py-2"
              value={form.CODPLA_CLI ?? ""}
              onChange={handlePlanChange}
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

      {/* ===== PRECIO FINAL DEL GRUPO (read-only) ===== */}
      <div className="mt-4">
        <div className="border rounded-2xl p-4 bg-gray-50">
          <div className="text-sm text-gray-600">
            Precio final del grupo (período {periodoActualMMYYYY()})
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {precioLoading
              ? "Calculando…"
              : precioErr
              ? <span className="text-red-600">{precioErr}</span>
              : precioGrupo != null
              ? fmtARS.format(Number(precioGrupo))
              : "—"}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Se recalcula al cambiar Plan, Zona o Prepago.
          </div>
        </div>
      </div>

      {/* SEXO (1=F, 2=M) */}
      <div className="mt-4">
        <span className="text-sm block mb-1">Sexo</span>
        <div className="flex items-center gap-6">
          <label className="inline-flex items-center gap-2">
            <input
              ref={refSexoM}
              tabIndex={8}
              type="radio"
              name="sexo"
              value={2}
              checked={Number(form.sexo) === 2}
              onChange={() => handleSexoClick(2)} // Masculino
            />
            <span>Masculino</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              ref={refSexoF}
              tabIndex={9}
              type="radio"
              name="sexo"
              value={1}
              checked={Number(form.sexo) === 1}
              onChange={() => handleSexoClick(1)} // Femenino
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
            tabIndex={10}
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/AAAA"
            className="w-full border rounded px-3 py-2"
            value={form.FECING_txt || ""}
            onChange={makeMaskedDateHandlerPreserveCaret("FECING_txt", refFvig)}
          />
        </label>

        <label className="block">
          <span className="text-sm">F. Vigencia</span>
          <input
            ref={refFvig}
            tabIndex={11}
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/AAAA"
            className="w-full border rounded px-3 py-2"
            value={form.FECVIG_txt || ""}
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
            tabIndex={12}
            className="w-full border rounded px-3 py-2"
            value={form.PREPAG_CLI ?? ""}
            onChange={handlePrepagChange}
            onBlur={handlePrepagBlur}
            onKeyDown={handlePrepagKey}
            inputMode="numeric"
          />
        </label>
      </div>

      {/* OBSERVACIONES */}
      <div className="mt-4">
        <label className="block">
          <span className="text-sm">Observaciones</span>
          <textarea
            ref={refObs}
            tabIndex={13}
            rows={4}
            className="w-full border rounded px-3 py-2"
            value={form.OBSERV_CLI || ""}
            onChange={(e) => setField("OBSERV_CLI", e.target.value)}
          />
        </label>
      </div>

      {/* BOTONES */}
      <div className="flex gap-2 mt-5">
        <button
          className="bg-green-600 hover:bg-green-700 text-white rounded px-4 py-2"
          onClick={onGuardar}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        <button className="border rounded px-4 py-2" onClick={onSalir}>
          Salir
        </button>
      </div>
    </div>
  );
}
