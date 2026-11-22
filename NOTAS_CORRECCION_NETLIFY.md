# Corrección Netlify / Vite — V1.0.99

Se eliminó el `[[redirects]]` global `/* -> /index.html` de `netlify.toml` porque en `netlify dev` interceptaba solicitudes de módulos JavaScript y Vite intentaba interpretar HTML como JavaScript.

## GitHub / Netlify
- Subir el contenido de este ZIP a la raíz del repositorio.
- Build command: `npm run build`.
- Publish directory: `dist`.
- Functions directory: `netlify/functions`.
- Configurar `FIREBASE_SERVICE_ACCOUNT_JSON` como variable de entorno privada en Netlify, nunca en GitHub.
- Las rutas internas SPA al recargar directamente pueden necesitar una regla de fallback específica de producción, a validar sin afectar `/src/` y los módulos de desarrollo.

## Local
`npm install` y `npx netlify dev` → http://localhost:8888

No se modificaron módulos de confidencialidad ni las reglas Firestore.
