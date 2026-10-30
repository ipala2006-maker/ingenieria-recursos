# Recuperacion de Catedras y capacidad del piloto

Fecha: 30 de octubre de 2026. Cloudflare Workers Free + Supabase Free.

## Error reproducido y correccion

El temporizador de Catedras siempre esperaba el intervalo normal, pero el
control de errores podia exigir una espera mayor. Despues del tercer fallo
con Catedras abierta, o del quinto con el modulo cerrado, el temporizador
despertaba antes de `retryAt`. `refresh` descartaba esa consulta y no quedaba
otro temporizador: el calendario compartido podia dejar de actualizarse hasta
recuperar foco o actualizar manualmente.

Tambien faltaba reintento automatico si fallaba la primera carga y aun no
existia un snapshot de materias.

Ahora el temporizador espera el mayor valor entre el intervalo normal y la
espera restante por errores, conservando el jitter. Un error inicial permite
reintentar; una respuesta correcta sin materias detiene las consultas
periodicas. Pestana oculta o cierre de sesion cancelan los reintentos. No se
reproducen escrituras ni se modifica la autenticacion o la base de datos.

En funcionamiento sano se conservan los intervalos anteriores: un minuto con
el modulo abierto y cinco minutos fuera, mas el jitter existente. La correccion
mejora recuperacion, no reduce magicamente el consumo ni aumenta por si sola
el numero de usuarios gratuitos.

Las pruebas nuevas se ejecutaron primero contra el codigo anterior: fallaron
los tres casos de reintento. Con la correccion se recuperan sin foco ni recarga.
Se cubren ademas visibilidad, logout, cuenta vacia y las tres entradas web.

Validacion local: 515 pruebas de regresion aprobadas (sin omisiones), mas las
pruebas moviles y los controles de seguridad/CSP. El aislamiento de comandos
bloqueo inicialmente los fixtures de PowerShell/Script Host; al repetir fuera
de ese aislamiento pasaron sin cambiar politicas ni tareas reales de Windows.
El benchmark de Catedras conserva el calendario identico: 39 lecturas, cinco
materias, 100 fechas, 914.576 -> 128.035 bytes JSON (86% menos frente al protocolo
anterior). No es una medicion de facturacion ni un nuevo ahorro de este parche.

## MAU de planificacion

Son hipotesis, no mediciones de usuarios reales ni capacidad certificada.
Presupuesto nominal de egress no cacheado: 5 GB/mes. Restar 1 GB para respaldos
y operacion, y conservar 30% de margen sobre el restante: 2,8 GB para usuarios.
Mes de 30 dias, KB/GB decimales, todos los dispositivos de cada persona incluidos.

| Escenario | Trafico completo supuesto por DAU/dia | DAU por egress | MAU con DAU/MAU entre 40% y 30% |
| --- | --- | --- | --- |
| Pesimista | 1.000 KB | 93 | 230-310 |
| Realista de planificacion | 250 KB | 373 | 930-1.240 |

MAU significa usuarios activos mensuales, no simultaneos. Un curso con varias
pantallas por persona puede agotar conexiones Realtime antes que el presupuesto
mensual. Los 50.000 MAU de Auth no representan la capacidad de toda Estudiemos.

Formula: `DAU = floor(2.800.000.000 / (30 * bytes_por_DAU_dia))`.
Luego `MAU = DAU / proporcion_DAU_MAU`. Si el backup mensual excede el GB
reservado o las personas usan la app mas dias, se debe recalcular a la baja.

## Como ampliar ese margen sin quitar funciones

1. Medir 7-14 dias de egress del proveedor junto con los dias activos reales y
   el trafico de backups. El contador local de JSON no incluye todos los costos.
2. Separar rutas y tamanos de respuestas para localizar descargas repetidas
   restantes: cuenta, clientes Android, catedras, Auth y cola push. Mantener
   los deltas y revisiones ya implementados; no volver a descargar perfiles
   enteros por cada widget ni aumentar sondeos.
3. Buscar un consumo completo de 200 KB/DAU/dia (466 DAU; unos 1.160-1.550 MAU),
   o 150 KB (622 DAU; unos 1.550-2.070 MAU), con los mismos supuestos. Son metas
   de optimizacion, no resultados acreditados de esta correccion.
4. Conservar backup diario hasta medirlo. Si domina el egress, evaluar
   incrementales con restauracion real o una frecuencia distinta explicitando
   la perdida recuperable de datos; no reducir proteccion silenciosamente.
5. Probar cohortes de 20, 50 y 100. Vigilar CPU por ruta bajo los 10 ms Free,
   conexiones Realtime, SMTP y puntualidad de alarmas antes de extrapolar.

Para 1.500 MAU se necesita menos de unos 207 KB/DAU/dia al 30% de actividad
diaria, o 156 KB al 40%, con este presupuesto. El ahorro de PDFs en Drive no
elimina ninguno de estos consumos auxiliares.

Fuentes oficiales consultadas:
- [Supabase cuotas](https://supabase.com/pricing).
- [Cloudflare limites](https://developers.cloudflare.com/workers/platform/limits/).

Modelo y advertencias generales: `docs/cloudflare-capacity-20261028.md` y
`docs/database-backups.md`.
