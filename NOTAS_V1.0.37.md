# V1.0.37 · Firma presencial interna (primera entrega funcional)

- Única cuenta ERP de Calidad; los trabajadores no necesitan cuentas.
- Función Netlify `/.netlify/functions/signature` autentica el ID token del Coordinador, exige perfil ADMIN/CALIDAD activo, coteja cédula y PIN.
- PIN de 6–12 dígitos derivado con PBKDF2-SHA256 y sal aleatoria; no se guarda en texto claro.
- Cinco intentos incorrectos producen bloqueo de 15 minutos.
- Firma únicamente con plantilla PSI-MC0201 V06 aprobada y archivada en Biblioteca.
- Constancia inmutable de servidor en `sgcSignatureRecords`, con fecha del servidor, facilitador, conflicto, identificador y huella SHA-256.
- El botón de constancia genera vista imprimible para guardar como PDF MANUALMENTE. **No existe todavía archivo PDF automático en el expediente.**
- No existe todavía restablecimiento de PIN por interfaz ni motor documental genérico para otros formatos.
- Este mecanismo es aceptación electrónica interna supervisada, NO firma digital certificada. La cuenta de Calidad puede técnicamente iniciar altas de PIN, por lo que se requiere supervisión y procedimiento de identidad.

## Netlify
1. Configurar variable de entorno `FIREBASE_SERVICE_ACCOUNT_JSON` con el JSON completo de cuenta de servicio del proyecto `sgc-psi` (en Netlify, nunca en GitHub). Mantener permisos estrictos.
2. Netlify debe desplegar `netlify/functions/signature.mjs` y ejecutar `npm install` (firebase-admin incluido en dependencias).
3. Aplicar el añadido de reglas de `REGLAS_FIRMA_V1.0.37.txt` a las reglas actuales.
4. Confirmar que la plantilla PSI-MC0201 V06 está archivada y APROBADA en Biblioteca.
5. Probar primero con trabajador de prueba y verificar el registro en Firestore.

## Limitaciones operativas
El código del servidor debe ejecutarse en Netlify; `vite dev` local no ofrece la función sin Netlify CLI. La creación de credenciales iniciales es una operación supervisada; el servicio no prueba presencia física. El PDF impreso no se almacena automáticamente.
