# Inicio local — V1.0.38

1. `npm install`
2. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` **solo en el entorno privado de Netlify** (no en GitHub).
3. `npx netlify login` y `npx netlify link` si no está vinculado el sitio.
4. `npm run dev:netlify`
5. Abra **http://localhost:8888** (no localhost:5173).

Si aparece «Servicio de firma no disponible», la función no está iniciada.
Si aparece «Configure FIREBASE_SERVICE_ACCOUNT_JSON», falta la variable privada.
El PIN es de **4 dígitos**. Se comprueba en el servidor y se bloquea temporalmente tras 5 fallos.

**Nota:** Las reglas completas de Firestore están en `REGLAS_GENERALES_COMPLETAS_V1.0.37.txt` y no necesitan cambios para pasar a cuatro dígitos: la validación del PIN ocurre en Netlify.
**Pendiente:** PDF archivado automáticamente y restablecimiento de PIN supervisado. La constancia imprimible se guarda manualmente.
