# Revisión de lanzamiento de Estudiemos

Fecha: 31 de agosto de 2026.

## Contenido, confianza y SEO

1. Política de privacidad: publicada en `about.html#privacidad`.
2. Términos de uso: publicados en `about.html#terminos`.
3. Imágenes: recursos visibles comprimidos y carga diferida fuera del primer bloque.
4. Versión mobile: verificada en 390 x 844 sin desbordamiento horizontal.
5. Favicon: SVG, PNG para Apple y manifest configurados.
6. Títulos: únicos en las páginas reales de carrera, materia y tema.
7. Metadescripciones: específicas por contenido.
8. Open Graph: título, descripción, URL e imagen configurados.
9. Texto alternativo: imágenes HTML con `alt` descriptivo o decorativo.
10. Canonical: configurado en las páginas indexables.
11. Robots y sitemap: presentes; widgets y 404 excluidos del índice.
12. Página 404: personalizada y con caminos de regreso.
13. Año legal: se actualiza automáticamente.
14. Logo: enlaza al inicio en todas las cabeceras principales.
15. Footer: incluye instalación, privacidad, términos y contacto.
16. Contacto: formulario real, sin teléfono ni correo inventados.

## Experiencia y funcionamiento

17. Formularios: campos obligatorios, límites y validación de entrada.
18. Mensajes de éxito: visibles tras las operaciones confirmadas.
19. Mensajes de error: visibles y expresados sin datos internos.
20. Enlaces internos: rastreo automático sin enlaces rotos.
21. Botones: controles semánticos y accesibles por teclado.
22. Placeholders: ejemplos útiles; no hay texto de relleno.
23. Navegación: enlaces reales e historial conservado en vistas internas.
24. Menú mobile: herramientas adaptadas a iconos y nombres accesibles.
25. Scroll horizontal: ausente en home, instalación, legales y 404.
26. Overflow mobile: contenido ajustado al viewport.
27. Carga: Lighthouse 90 rendimiento, 100 accesibilidad, 100 buenas prácticas y 100 SEO en la página de instalación local.
28. Imágenes prioritarias: dimensiones, precarga y prioridad de descarga definidas.
29. Otros navegadores: sintaxis estándar y degradación sin funciones experimentales obligatorias; falta una pasada física final en Safari de iPhone.
30. Pomodoro iPhone: desbloqueo de audio por gesto, reanudación tras volver del fondo y notificación del sistema con sonido.

## Seguridad y datos

31. HTTPS: HSTS, bloqueo de contenido mixto y actualización de solicitudes inseguras.
32. Cabeceras: CSP, `nosniff`, política de referencia, permisos y aislamiento de origen.
33. Claves API: ninguna credencial con formato de clave encontrada en archivos versionados.
34. Cuentas: RLS limita estado, archivos y planes al usuario autenticado.
35. Archivos: bucket privado, rutas por usuario y límites de plan aplicados en servidor.
36. Exportación administrativa: sin caché, sin referencia, fuera de buscadores y protegida por token privado.
37. Divulgación y pentest: `security.txt` y política publicadas; revisión Strix preparada. El escaneo activo requiere iniciar sesión en Strix Cloud o configurar Docker y una clave de modelo.

## Decisiones conscientes

- No se añadió un banner de cookies porque Estudiemos no usa cookies publicitarias ni analítica no esencial en este momento.
- Las métricas de Vercel no están activas todavía. Deben habilitarse desde la cuenta propietaria antes del lanzamiento si se desean métricas anónimas.
- Ningún escáner puede garantizar que una aplicación sea imposible de vulnerar. La revisión debe repetirse cuando cambien autenticación, pagos, almacenamiento o mensajería.
