# V1.0.97 — Corrección de permisos 4.2.2

- Se ajusta `firestore.rules` a los campos reales enviados por el control simplificado: `evaluationType: CONTROL_APLICACION` y `controlStatus`.
- Conserva lectura e historial de evaluaciones anteriores con `checks`.
- Se mantiene el acceso de ADMIN/CALIDAD y la inmutabilidad de los registros.
- **Publicar `firestore.rules` en Firebase Console antes de probar el guardado.**
