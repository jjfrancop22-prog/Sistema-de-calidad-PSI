# Reglas generales V1.0.37

1. Abra Firebase Console → Firestore Database → Reglas.
2. Copie **todo** el contenido de `firestore.rules` (idéntico a `REGLAS_GENERALES_COMPLETAS_V1.0.37.txt`).
3. Sustituya las reglas anteriores y pulse **Publicar**.
4. No reemplace las reglas de Storage; este archivo corresponde exclusivamente a Firestore.
5. Las colecciones `sgcSignatureCredentials` y `sgcSignatureRecords` se escriben solo mediante Firebase Admin desde la función Netlify. Los clientes no pueden leer PIN ni crear constancias.
6. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` como variable privada en Netlify y compruebe el funcionamiento antes de usar firmas oficiales.

**Importante:** Estas reglas no configuran por sí solas Netlify ni activan automáticamente el servicio de firma. No incluya credenciales de servidor en GitHub.
