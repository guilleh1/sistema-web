// oa-ui/src/App.jsx
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import AfiliadosList from "./pages/AfiliadosList.jsx";
import SocioEdit from "./pages/SocioEdit.jsx";
import SocioCreate from "./pages/SocioCreate.jsx";

function Layout({ children }) {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar simple */}
      <aside className="w-56 border-r px-3 py-4">
        <h1 className="font-semibold mb-4">Organización Aquino · Panel</h1>
        <nav className="flex flex-col gap-2">
          <NavLink
            to="/afiliados"
            className={({ isActive }) =>
              `px-3 py-2 rounded ${isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`
            }
          >
            Afiliados
          </NavLink>
          <NavLink
            to="/socios/alta"
            className={({ isActive }) =>
              `px-3 py-2 rounded ${isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`
            }
          >
            Dar de Alta
          </NavLink>
        </nav>
      </aside>

      <main className="flex-1">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          {/* Redirigir raíz a /afiliados */}
          <Route path="/" element={<Navigate to="/afiliados" replace />} />

          {/* Lista */}
          <Route path="/afiliados" element={<AfiliadosList />} />

          {/* Alta */}
          <Route path="/socios/alta" element={<SocioCreate />} />

          {/* Edición */}
          <Route path="/socios/:numeroCli" element={<SocioEdit />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/afiliados" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
