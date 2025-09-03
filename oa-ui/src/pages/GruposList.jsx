import { useEffect, useState } from "react";
import { api } from "../api/client";

// Funciones helper para adaptarnos a distintos formatos
function getId(g) {
  return g.id ?? g.grupoId ?? g.num_grupo ?? g.num_socio ?? "—";
}
function getTitular(g) {
  return (
    g.titular ??
    g.titular_nombre ??
    g.titular_apellido_nombre ??
    g.titulo ?? // por las dudas
    "—"
  );
}
function getIntegrantesCount(g) {
  if (Array.isArray(g.integrantes)) return g.integrantes.length;
  if (typeof g.integrantes === "number") return g.integrantes;
  if (typeof g.cantidad_integrantes === "number") return g.cantidad_integrantes;
  return 0;
}
function getPlan(g) {
  return g.plan?.nombre ?? g.plan ?? g.plan_nombre ?? "—";
}

export default function GruposList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");

    api
      .get("/grupos")
      .then((res) => {
        if (!mounted) return;
        // Aceptamos array directo o {data: [...]}
        const data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
        setRows(data);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e?.response?.data?.message || e?.message || "Error al cargar grupos");
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Grupos</h2>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm"
        >
          Recargar
        </button>
      </div>

      {loading && (
        <div className="text-sm text-gray-600">Cargando grupos...</div>
      )}

      {err && !loading && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {err} <span className="text-xs text-gray-600">¿Está corriendo el backend y con CORS habilitado?</span>
        </div>
      )}

      {!loading && !err && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Titular</th>
                <th className="text-left p-3">Integrantes</th>
                <th className="text-left p-3">Plan</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={4}>
                    No hay grupos para mostrar.
                  </td>
                </tr>
              )}
              {rows.map((g, i) => (
                <tr key={getId(g) + "_" + i} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="p-3">{getId(g)}</td>
                  <td className="p-3">{getTitular(g)}</td>
                  <td className="p-3">{getIntegrantesCount(g)}</td>
                  <td className="p-3">{getPlan(g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Fuente: <code>GET /grupos</code> en <code>{import.meta.env.VITE_API_URL}</code>
      </p>
    </div>
  );
}
//pruba