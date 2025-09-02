// oa-ui/src/pages/AfiliadosList.jsx
import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";

/** Normaliza mayúsculas y espacios para búsquedas de texto */
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
}

/** Solo dígitos (soporta que vengan números con "/") */
function digits(s) {
  return String(s || "").replace(/\D/g, "");
}

/** Muestra "base/yy" si hay al menos 3 dígitos (tolerante a valores cortos) */
function formatNumeroWithSlash(value) {
  const d = digits(value);
  if (d.length <= 2) return String(value || "");
  const base = d.slice(0, -2);
  const suf = d.slice(-2).padStart(2, "0");
  return `${base}/${suf}`;
}

/** Formatea fecha ISO (YYYY-MM-DD) a DD/MM/AAAA */
function isoToDDMMYYYY(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  } catch {
    return "";
  }
}

/* ===== Celda de "Precio Grupo" (cálculo lazy con caché) ===== */
const __priceCache = new Map();

function getNumeroAny(obj) {
  return obj?.NUMERO_CLI ?? obj?.numero_cli ?? obj?.numero ?? "";
}
function getPlanCodigoAny(obj) {
  return obj?.CODPLA_CLI ?? obj?.codpla_cli ?? obj?.plan ?? "";
}
function getFnacISOAny(obj) {
  return obj?.FNACIM_CLI ?? obj?.fnacim_cli ?? obj?.FNACIM ?? obj?.fnac ?? null;
}
function getPrepagoAny(obj) {
  return obj?.PREPAG_CLI ?? obj?.prepag_cli ?? obj?.prepago ?? 0;
}

function PriceGrupoCell({ item, fmtARS }) {
  const [val, setVal] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const numero = digits(getNumeroAny(item));
    const planCodigo = String(getPlanCodigoAny(item) || "").trim();
    const fnacISO = getFnacISOAny(item);
    const prepag = Number(getPrepagoAny(item) || 0) || 0;

    if (!planCodigo || !fnacISO) {
      setVal(null);
      return;
    }

    const key = `${numero}|${planCodigo}|${fnacISO}|${prepag}`;
    if (__priceCache.has(key)) {
      setVal(__priceCache.get(key));
      return;
    }

    setLoading(true);
    client
      .post("/grupos/v2/calcular-grupo-draft", {
        planCodigo,
        integrantes: [
          {
            numero_cli: Number(numero) || 0,
            nombre_cli: item.NOMBRE_CLI ?? item.nombre_cli ?? item.nombre ?? "",
            fnacim_cli: fnacISO,
            prepag_cli: prepag,
            tipo: "T",
          },
        ],
      })
      .then((rp) => {
        const total = rp?.data?.data?.total;
        if (typeof total === "number") {
          __priceCache.set(key, total);
          setVal(total);
        } else {
          setVal(null);
        }
      })
      .catch(() => setVal(null))
      .finally(() => setLoading(false));
  }, [item]);

  return (
    <td className="px-3 py-2 border-b text-right">
      {loading ? "…" : (val == null ? "—" : fmtARS.format(val))}
    </td>
  );
}

export default function AfiliadosList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // === Búsqueda (número / nombre / dni) ===
  const [searchType, setSearchType] = useState("numero");
  const [searchText, setSearchText] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchText), 250);
    return () => clearTimeout(t);
  }, [searchText]);

  // === Scroll y navegación ===
  const STEP = 1; // de a un afiliado con flechas
  const scrollRef = useRef(null);
  const intervalRef = useRef(null);     // mantener apretado flechas
  const rafRef = useRef(null);          // throttle de onScroll
  const rowHeightRef = useRef(42);      // altura default de fila
  const wheelTsRef = useRef(0);         // último wheel procesado (cooldown)
  const WHEEL_COOLDOWN_MS = 120;        // 1 paso por gesto

  const [visibleFrom, setVisibleFrom] = useState(0);
  const [visibleTo, setVisibleTo] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  // Ref del input para controlar el caret tras formateo
  const inputRef = useRef(null);

  // Router navigate
  const navigate = useNavigate();
  const EDIT_BASE = "/socios"; // ruta que usa SocioEdit: /socios/:numeroCli

  // ===== [INSERCIÓN] Atajo teclado: INSERT → abrir "Dar de Alta" =====
  useEffect(() => {
    function goToAlta() {
      // 1) Intentar clicar el link "Dar de Alta" visible en el layout
      const links = Array.from(document.querySelectorAll("a[href]"));
      const altaLink = links.find((a) =>
        /dar\s*de\s*alta/i.test((a.textContent || "").trim())
      );
      if (altaLink) {
        altaLink.click();
        return;
      }
      // 2) Fallback a rutas comunes (primera que exista en tu router)
      const candidates = ["/socios/alta", "/alta", "/socios/create", "/socios/new"];
      navigate(candidates[0]);
    }

    function handleInsertShortcut(e) {
      if (e.key === "Insert" || e.keyCode === 45) {
        e.preventDefault();
        goToAlta();
      }
    }

    window.addEventListener("keydown", handleInsertShortcut);
    return () => window.removeEventListener("keydown", handleInsertShortcut);
  }, [navigate]);

  // === Modal Dar de Baja ===
  const [showBaja, setShowBaja] = useState(false);
  const [selSocio, setSelSocio] = useState(null);
  const [fechaBaja, setFechaBaja] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  });
  const [motivo, setMotivo] = useState(""); // inicial vacío
  const [obs, setObs] = useState("");
  const [alcance, setAlcance] = useState("socio"); // "socio" | "grupo"
  const [savingBaja, setSavingBaja] = useState(false);

  // Cargar datos
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const rp = await client.get("/socios?limit=all");
        const data = rp?.data?.data || rp?.data || [];
        setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e?.response?.data?.message || e?.message || "Error cargando afiliados");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Resetear scroll al cambiar filtros
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [searchType, debounced]);

  // Handler para formatear el input en vivo cuando el modo es "numero"
  function handleSearchChange(e) {
    const val = e.target.value;
    if (searchType !== "numero") {
      setSearchText(val);
      return;
    }
    const formatted = formatNumeroWithSlash(val);
    setSearchText(formatted);

    // Llevar el cursor al final después de formatear
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) el.setSelectionRange(formatted.length, formatted.length);
    });
  }

  // === Filtrado en cliente ===
  const filtered = useMemo(() => {
    if (!debounced.trim()) return items;

    if (searchType === "numero") {
      const qRaw = debounced.trim();
      const qDigits = digits(qRaw);
      if (!qDigits) return items;

      const isGroup = /(?:\/00|00)$/.test(qRaw);

      return items.filter((it) => {
        const numeroRaw = it.numero ?? it.numero_cli ?? it.NUMERO_CLI ?? "";
        const numDigits = digits(numeroRaw);
        if (!numDigits) return false;

        if (isGroup && qDigits.length >= 3) {
          const base = qDigits.slice(0, -2);
          return numDigits.startsWith(base) && numDigits.length === base.length + 2;
        }

        if (numDigits.length === qDigits.length) {
          return numDigits === qDigits;
        }
        return numDigits.startsWith(qDigits);
      });
    }

    if (searchType === "dni") {
      const q = norm(debounced);
      return items.filter((it) => {
        const dni = String(it.dni || it.nrodoc_cli || it.NRODOC_CLI || "");
        return dni.startsWith(q);
      });
    }

    const q = norm(debounced);
    return items.filter((it) => {
      const nombre = norm(it.nombre || it.nombre_cli || it.NOMBRE_CLI || "");
      return nombre.startsWith(q);
    });
  }, [items, debounced, searchType]);

  const total = filtered.length;

  // Formateador ARS memorizado
  const fmtARS = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 2,
      }),
    []
  );

  // Medir altura de fila y actualizar rango visible
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      const firstRow = scrollRef.current?.querySelector("tbody tr");
      if (firstRow) {
        const h = firstRow.getBoundingClientRect().height;
        if (h && Number.isFinite(h)) rowHeightRef.current = h;
      }
      updateVisibleRange();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, loading]);

  // Rango visible
  function updateVisibleRange() {
    const el = scrollRef.current;
    if (!el) return;
    const rh = rowHeightRef.current || 42;
    const startIdx = Math.max(0, Math.floor(el.scrollTop / rh));
    const visibleRows = Math.max(1, Math.ceil(el.clientHeight / rh));
    const endIdx = Math.min(total, startIdx + visibleRows);
    setVisibleFrom(total === 0 ? 0 : startIdx + 1);
    setVisibleTo(endIdx);
    setAtStart(el.scrollTop <= 1);
    setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  }

  function onScroll() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      updateVisibleRange();
      rafRef.current = null;
    });
  }

  // Scroll con flechas
  function scrollByRows(n) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += n * (rowHeightRef.current || 42);
  }
  function gotoFirst() {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }
  function gotoLast() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  // Mantener apretado (flechas)
  function handleHold(action) {
    action();
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(action, 120);
  }
  function clearHold() {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

  // Wheel nativo
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheelNative = (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - wheelTsRef.current < WHEEL_COOLDOWN_MS) return;
      wheelTsRef.current = now;

      const dir = e.deltaY > 0 ? 1 : -1;
      const rh = rowHeightRef.current || 42;
      el.scrollTop += dir * rh;
    };

    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative, { passive: false });
  }, []);

  useEffect(() => {
    return () => {
      clearHold();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // === Navegación a edición ===
  function openSocio(item) {
    const numeroRaw = item.NUMERO_CLI ?? item.numero ?? item.numero_cli ?? "";
    let id = digits(numeroRaw);
    if (!id) {
      id = digits(item.NRODOC_CLI ?? item.dni ?? "") || String(item.id ?? "");
    }
    if (id) {
      navigate(`${EDIT_BASE}/${encodeURIComponent(id)}`);
    }
  }

  // === Dar de baja ===
  function handleOpenBaja(item) {
    setSelSocio(item);
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setFechaBaja(`${d.getFullYear()}-${mm}-${dd}`);
    setMotivo("");
    setObs("");
    setAlcance("socio");
    setShowBaja(true);
  }

  async function handleConfirmBaja() {
    if (!selSocio) return;
    if (!motivo.trim()) {
      alert("El motivo es obligatorio.");
      return;
    }
    const numero = selSocio.NUMERO_CLI ?? selSocio.numero ?? selSocio.numero_cli ?? "";
    if (!numero) {
      alert("No se encontró el número del socio.");
      return;
    }

    try {
      setSavingBaja(true);
      const { data } = await client.post(`/socios/${digits(numero)}/baja`, {
        fecha_baja: fechaBaja,
        motivo: motivo.trim(),
        observaciones: obs || null,
        alcance, // "socio" o "grupo"
      });

      if (data?.tipo === "grupo" && Array.isArray(data?.numeros) && data.numeros.length) {
        const toRemove = new Set(data.numeros.map((n) => String(n)));
        setItems((prev) => prev.filter((x) => !toRemove.has(String(digits(getNumeroAny(x))))));
      } else if (alcance === "grupo") {
        const base = Math.floor(Number(digits(numero)) / 100) * 100;
        setItems((prev) => prev.filter((x) => Math.floor(Number(digits(getNumeroAny(x))) / 100) * 100 !== base));
      } else {
        setItems((prev) => prev.filter((x) => String(digits(getNumeroAny(x))) !== String(digits(numero))));
      }

      setShowBaja(false);
      setSelSocio(null);
    } catch (e) {
      console.error(e);
      alert("No se pudo dar de baja. Verifique la conexión o el backend.");
    } finally {
      setSavingBaja(false);
    }
  }

  return (
    <div className="p-6">
      {/* Título */}
      <div className="mb-1">
        <h2 className="text-xl font-semibold">Afiliados</h2>
      </div>

      {/* Buscador centrado */}
      <div className="mb-3 flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <select
            className="border rounded px-2 py-1"
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            title="Modo de búsqueda"
          >
            <option value="numero">Número</option>
            <option value="nombre">Nombre</option>
            <option value="dni">DNI</option>
          </select>

          <input
            ref={inputRef}
            className="border rounded px-3 py-1.5 w-64"
            placeholder={
              searchType === "numero"
                ? "Número (ej: 13800 → grupo 138 | 1380/01 → exacto)"
                : searchType === "dni"
                ? "Buscar por DNI…"
                : "Buscar por apellido y nombre…"
            }
            value={searchText}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {/* Flechas centradas */}
      <div className="mb-2 flex justify-center">
        <div className="flex items-center gap-1">
          <button
            className="border rounded px-2 py-1 disabled:opacity-50"
            onClick={gotoFirst}
            disabled={atStart || loading || total === 0}
            title="Ir al principio"
          >
            «
          </button>

          <button
            className="border rounded px-2 py-1 disabled:opacity-50"
            onMouseDown={() => handleHold(() => scrollByRows(-STEP))}
            onMouseUp={clearHold}
            onMouseLeave={clearHold}
            disabled={atStart || loading || total === 0}
            title="Retroceder"
          >
            ‹
          </button>

          <button
            className="border rounded px-2 py-1 disabled:opacity-50"
            onMouseDown={() => handleHold(() => scrollByRows(STEP))}
            onMouseUp={clearHold}
            onMouseLeave={clearHold}
            disabled={atEnd || loading || total === 0}
            title="Avanzar"
          >
            ›
          </button>

          <button
            className="border rounded px-2 py-1 disabled:opacity-50"
            onClick={gotoLast}
            disabled={atEnd || loading || total === 0}
            title="Ir al final"
          >
            »
          </button>
        </div>
      </div>

      {/* Tabla con scroll controlado */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="border rounded overflow-x-auto overflow-y-auto max-h-[calc(100vh-220px)]"
      >
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2 border-b">Número</th>
              <th className="px-3 py-2 border-b">Nombre</th>
              <th className="px-3 py-2 border-b">DNI</th>
              <th className="px-3 py-2 border-b">Edad</th>
              <th className="px-3 py-2 border-b">F. Vigencia</th>
              <th className="px-3 py-2 border-b">Zona</th>
              <th className="px-3 py-2 border-b">Plan</th>
              <th className="px-3 py-2 border-b">Prepago</th>
              <th className="px-3 py-2 border-b text-right">Precio Grupo</th>
              <th className="px-3 py-2 border-b text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-3" colSpan={10}>
                  Cargando…
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td className="px-3 py-3 text-red-600" colSpan={10}>
                  {err}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-3" colSpan={10}>
                  Sin datos para mostrar.
                </td>
              </tr>
            ) : (
              filtered.map((it, idx) => {
                const numero = it.numero ?? it.numero_cli ?? it.NUMERO_CLI ?? "";
                const nombre = it.nombre ?? it.nombre_cli ?? it.NOMBRE_CLI ?? "";
                const dni = it.dni ?? it.nrodoc_cli ?? it.NRODOC_CLI ?? "";
                const edad = it.edad ?? it.EDAD ?? it.edad_cli ?? "";
                const fecVig =
                  it.fecvig_cli ?? it.FECVIG_CLI ?? it.fec_vigencia ?? it.F_VIGENCIA ?? null;
                const zona = it.zona ?? it.CODZON_CLI ?? it.codzon_cli ?? "";
                const plan = it.plan ?? it.CODPLA_CLI ?? it.codpla_cli ?? "";
                const prepago = it.prepag_cli ?? it.PREPAG_CLI ?? it.prepago ?? 0;

                const keyVal = String(numero || dni || it.id || idx);
                const numeroFmt = formatNumeroWithSlash(numero);

                return (
                  <tr
                    key={keyVal}
                    className="odd:bg-white even:bg-gray-50 hover:bg-gray-100"
                  >
                    <td className="px-3 py-2 border-b">{numeroFmt}</td>
                    <td className="px-3 py-2 border-b">{String(nombre || "").toUpperCase()}</td>
                    <td className="px-3 py-2 border-b">{dni}</td>
                    <td className="px-3 py-2 border-b text-right">{edad}</td>
                    <td className="px-3 py-2 border-b">{isoToDDMMYYYY(fecVig)}</td>
                    <td className="px-3 py-2 border-b text-right">{zona}</td>
                    <td className="px-3 py-2 border-b text-right">{plan}</td>
                    <td className="px-3 py-2 border-b text-right">
                      {fmtARS.format(Number(prepago || 0))}
                    </td>

                    {/* Precio Grupo */}
                    <PriceGrupoCell item={it} fmtARS={fmtARS} />

                    {/* Acciones */}
                    <td className="px-3 py-2 border-b">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                          title="Editar"
                          onClick={() => openSocio(it)}
                        >
                          Editar
                        </button>
                        <button
                          className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                          title="Dar de baja"
                          onClick={() => handleOpenBaja(it)}
                        >
                          Dar de baja
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Dar de Baja */}
      {showBaja && selSocio && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dar de baja</h2>
              <button
                onClick={() => setShowBaja(false)}
                className="text-slate-500 hover:text-slate-700"
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="text-sm space-y-3">
              <div>
                <span className="font-medium">Afiliado:</span>{" "}
                {(selSocio?.NOMBRE_CLI ||
                  selSocio?.nombre_cli ||
                  selSocio?.nombre ||
                  "(sin nombre)")}{" "}
                — <span className="font-medium">Nº</span>{" "}
                {getNumeroAny(selSocio)}
              </div>

              {/* Alcance: socio o grupo */}
              <fieldset className="border rounded p-2">
                <legend className="text-xs text-slate-600 px-1">Alcance de la baja</legend>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="alcance"
                      value="socio"
                      checked={alcance === "socio"}
                      onChange={() => setAlcance("socio")}
                    />
                    <span>Solo este afiliado</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="alcance"
                      value="grupo"
                      checked={alcance === "grupo"}
                      onChange={() => setAlcance("grupo")}
                    />
                    <span>
                      Grupo completo (mismo base {Math.floor(Number(digits(getNumeroAny(selSocio))) / 100) * 100}…+99)
                    </span>
                  </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col">
                  <span className="text-xs text-slate-600 mb-1">Fecha de baja</span>
                  <input
                    type="date"
                    className="border rounded px-2 py-1"
                    value={fechaBaja}
                    onChange={(e) => setFechaBaja(e.target.value)}
                  />
                </label>

                <label className="flex flex-col sm:col-span-2">
                  <span className="text-xs text-slate-600 mb-1">Motivo (obligatorio)</span>
                  <select
                    className="border rounded px-2 py-1"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  >
                    <option value="">Seleccionar motivo…</option>
                    <option value="Voluntario">Voluntario</option>
                    <option value="Por Mora">Por Mora</option>
                    <option value="Fallecido">Fallecido</option>
                    <option value="Cambio de Plan">Cambio de Plan</option>
                    <option value="Se Mudo">Se Mudo</option>
                  </select>
                </label>

                <label className="flex flex-col sm:col-span-2">
                  <span className="text-xs text-slate-600 mb-1">Observaciones (opcional)</span>
                  <textarea
                    className="border rounded px-2 py-1 min-h-[80px]"
                    placeholder="Comentarios adicionales…"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                  />
                </label>
              </div>

              <div className="mt-1 text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Atención: esta acción mueve el/los registro(s) a <b>maecli_bajas</b> y los elimina de activos.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowBaja(false)}
                className="px-3 py-1.5 rounded border hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmBaja}
                disabled={savingBaja}
                className="px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {savingBaja ? "Guardando…" : "Confirmar baja"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
