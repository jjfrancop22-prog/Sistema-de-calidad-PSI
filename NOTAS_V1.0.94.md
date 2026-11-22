V1.0.94 — Corrección de sincronización documental 4.2

Causa: el observador de Biblioteca en main.jsx se activaba para 8.3, 4.1 y 8.5, pero omitía 4.2. Al abrir 4.2 después de refrescar, libraryItems quedaba vacío.

Solución: incluir 4.2 en el mismo observador bajo demanda. Se reutilizan las vinculaciones existentes; no se escriben ni duplican documentos de Firebase.
