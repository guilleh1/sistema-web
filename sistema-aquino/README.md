# Sistema Aquino (Starter API)

API mínima en Node + Express + MySQL para calcular importes del grupo (portado desde VFP).

## Requisitos
- Node.js (LTS) y npm
- MySQL/MariaDB (con tablas ya migradas)
- VS Code (sugerido)

## Pasos rápidos

```bash
npm install
cp .env.example .env  # en Windows: copiar manualmente
# editar .env con tus credenciales
npm run dev
# Probar en navegador:
# http://localhost:3001/v2/calcular-grupo/1100
```

## Estructura
- `src/app.js`  -> app Express
- `src/db.js`   -> conexión a MySQL
- `src/routes/grupos.js` -> endpoint de cálculo
- `src/services/grupos.service.js` -> consultas a BD
- `src/domain/calculo.js` -> reglas de negocio
