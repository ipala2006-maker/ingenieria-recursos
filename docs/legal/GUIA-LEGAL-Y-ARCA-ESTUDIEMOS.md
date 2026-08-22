# Guía legal y fiscal de lanzamiento - Estudiemos

**Borrador operativo para Argentina - 22 de agosto de 2026**

Esta guía ordena las tareas previas a cobrar por Estudiemos. No reemplaza el asesoramiento de un abogado ni de un contador matriculado. Las pantallas actuales son una demostración sin cobros.

## 1. Información que Ian debe definir

Antes de publicar documentos legales o crear cobros reales, completar:

1. Nombre completo de la persona que explotará Estudiemos o razón social.
2. CUIT y condición fiscal actual.
3. Domicilio real, fiscal y provincia desde la que se presta el servicio.
4. Correo exclusivo de soporte y correo de privacidad.
5. Si habrá usuarios menores de 18 años.
6. Política comercial definitiva: precios, renovación, devolución y plazo de conservación de cuentas congeladas.
7. Titular de la marca, dominio y cuenta vendedora de Mercado Pago.

No se deben publicar CUIT o domicilio en el repositorio hasta decidir qué datos exige mostrar la normativa y preparar una vía segura de administración.

## 2. Alta fiscal ante ARCA

### Paso 1 - CUIT y clave fiscal

Ingresar a https://www.arca.gob.ar/ y verificar que Ian tenga CUIT y clave fiscal operativa. Si no los tiene, iniciar la inscripción desde la aplicación oficial o el procedimiento indicado por ARCA.

### Paso 2 - Domicilio Fiscal Electrónico

Ingresar con clave fiscal al servicio “Domicilio Fiscal Electrónico”, registrar correo y teléfono y confirmar los códigos solicitados. Es obligatorio y las comunicaciones se consideran notificadas, por lo que debe revisarse periódicamente.

### Paso 3 - Registro Único Tributario

Abrir “Registro Único Tributario - RUT”. Cargar o verificar domicilios y jurisdicción sede. Si no existe un local, ARCA indica que normalmente debe utilizarse el domicilio real como domicilio fiscal provincial o sede, según la jurisdicción.

Declarar la actividad económica principal. Para Estudiemos debe buscarse una actividad de servicios de software, informática, portal web o servicios digitales. **No elegir el código por intuición:** pedir al contador que confirme el código exacto según el modo real de explotación y facturación.

### Paso 4 - Alta en monotributo

Entrar al Portal Monotributo y seleccionar “Darse de alta”. Declarar fecha de inicio, actividad, facturación anual estimada, aportes jubilatorios y obra social según la situación personal.

La categoría depende de ingresos y otros parámetros vigentes. No usar cifras copiadas de una guía antigua: consultar la tabla actual de ARCA el mismo día del alta.

### Paso 5 - Ingresos Brutos

Verificar si la provincia participa del Monotributo Unificado. Córdoba, CABA, Buenos Aires y otras jurisdicciones están adheridas, pero el procedimiento y los componentes pueden variar.

Si se presta el servicio desde una sola provincia, revisar el régimen local simplificado. Si existe actividad real en varias jurisdicciones, consultar antes de inscribirse porque podría corresponder Convenio Multilateral.

### Paso 6 - Punto de venta

En RUT o “Administración de Puntos de Venta y Domicilios”, crear un punto de venta específico para facturación electrónica. Elegir “Comprobantes en Línea” o el sistema que recomiende el contador.

### Paso 7 - Factura electrónica

Los monotributistas deben emitir factura electrónica tipo C a consumidores finales. Configurar “Comprobantes en Línea” y realizar una factura de prueba controlada antes de habilitar suscripciones.

La factura debe describir el servicio, por ejemplo “Suscripción mensual Estudiemos Plus”, indicar el período y coincidir con el importe efectivamente cobrado.

### Paso 8 - Rutina mensual

Guardar reportes de Mercado Pago, facturas, devoluciones y comisiones. Pagar el monotributo e Ingresos Brutos cuando corresponda. Controlar límites y fechas de recategorización. Conciliar cada cobro con una factura o nota de crédito.

## 3. Mercado Pago antes de producción

1. Utilizar una cuenta vendedora a nombre del mismo titular fiscal.
2. Crear una aplicación en “Tus integraciones”.
3. Comenzar con credenciales de prueba.
4. Guardar Access Token y secreto de webhook únicamente en Vercel.
5. Crear el pago de bienvenida desde el servidor.
6. Activar pruebas solo después de un webhook firmado y una consulta del pago a Mercado Pago.
7. Crear Plus y Pro mediante Suscripciones, no reutilizando datos de tarjeta del pago inicial.
8. Probar aprobación, rechazo, pago pendiente, repetición de webhook, cancelación, devolución y contracargo.
9. Verificar en producción si Mercado Pago acepta un cobro de $10 ARS y cuál es su comisión. Si no resulta viable, modificar el importe antes de anunciarlo.

## 4. Defensa del consumidor

Antes del primer cobro, Estudiemos deberá mostrar:

- Identidad y datos de contacto del proveedor.
- Características y límites de cada plan.
- Precio final en pesos argentinos, periodicidad y medio de pago.
- Renovación automática y procedimiento simple de cancelación.
- Política de devolución y tratamiento de cobros duplicados.
- Términos y Condiciones completos antes de confirmar.
- Botón de arrepentimiento visible, sin exigir una nueva registración.
- Constancia o código de cada solicitud de cancelación o arrepentimiento.
- Canal de soporte y enlace a organismos de defensa del consumidor.

La aceptación debe registrarse con usuario, versión del documento, fecha y hora. No usar casillas premarcadas.

## 5. Protección de datos personales

1. Completar y publicar la Política de Privacidad.
2. Definir al responsable, domicilio y correo para derechos de datos.
3. Consultar e iniciar, si corresponde, la inscripción del responsable y las bases ante la AAIP mediante TAD.
4. Registrar qué datos se recogen, para qué, dónde se guardan y con quién se comparten.
5. Documentar transferencias a Supabase, Vercel, Google y Mercado Pago.
6. Permitir acceso, corrección, exportación y eliminación.
7. Definir plazos de conservación para cuentas activas, congeladas, eliminadas, pagos y registros de seguridad.
8. Mantener un procedimiento de incidentes y responsables de respuesta.
9. No enviar el contenido de archivos a la IA sin informar y obtener una autorización adecuada.
10. Revisar las medidas recomendadas por la Resolución AAIP 47/2018.

## 6. Documentos que deben existir en la web

- Términos y Condiciones.
- Política de Privacidad.
- Política de uso justo de IA.
- Política de cancelación y reembolsos.
- Información del proveedor y contacto.
- Botón de arrepentimiento.
- Centro simple para cancelar, exportar datos y eliminar la cuenta.

Los borradores anexos cubren la base, pero deben completarse y revisarse antes de publicarlos.

## 7. Orden seguro de lanzamiento

### Etapa A - Ahora

- Mantener la vista de precios como simulación.
- Completar datos fiscales y comerciales.
- Elegir contador y abogado.
- Revisar precios y costos reales.

### Etapa B - Pruebas privadas

- Ejecutar el SQL de facturación en Supabase de pruebas.
- Integrar credenciales de prueba de Mercado Pago.
- Probar webhooks y estados sin dinero real.
- Probar modo lectura con cuentas creadas exclusivamente para QA.

### Etapa C - Antes de cobrar

- Alta fiscal e Ingresos Brutos confirmados.
- Facturación electrónica lista.
- Documentos legales completos y publicados.
- Base de datos y proveedores revisados ante AAIP.
- Botones de baja y arrepentimiento funcionando.
- Credenciales productivas protegidas.
- Prueba real controlada con factura, cancelación y devolución.

### Etapa D - Operación

- Conciliación y facturación periódica.
- Atención de reclamos.
- Monitoreo de pagos, IA y almacenamiento.
- Revisión mensual de precios y margen.
- Revisión legal y de seguridad cuando cambie una función importante.

## 8. Qué puede hacer Codex y qué debe hacer Ian

### Codex puede preparar

- Páginas legales y registro de aceptación.
- Integración técnica con Mercado Pago en pruebas.
- Webhooks, estados, bloqueos y recuperación.
- Exportación y eliminación de datos.
- Botones de cancelación y arrepentimiento.
- Controles de almacenamiento, IA y seguridad.
- Pruebas automáticas y documentación operativa.

### Ian debe realizar personalmente

- Trámites con identidad, CUIT y clave fiscal.
- Elegir y pagar la condición tributaria indicada por el contador.
- Abrir y verificar la cuenta vendedora de Mercado Pago.
- Proporcionar los datos legales que aparecerán al consumidor.
- Aceptar contratos de proveedores.
- Obtener la revisión final de abogado y contador.

## 9. Fuentes oficiales consultadas

- ARCA - Inicio de monotributo: https://www.arca.gob.ar/monotributo/ayuda/inicio.asp
- ARCA - Domicilio Fiscal Electrónico: https://www.arca.gob.ar/monotributo/ayuda/domicilio-fiscal-electronico.asp
- ARCA - Monotributo Unificado: https://arca.gob.ar/monotributo/ayuda/monotributo-unificado.asp
- ARCA - Facturación: https://www.arca.gob.ar/monotributo/ayuda/facturacion.asp
- ARCA - Actividades económicas: https://arca.gob.ar/monotributo/ayuda/actividades.asp
- Defensa del Consumidor - Ley 24.240: https://www.argentina.gob.ar/normativa/nacional/ley-24240-638/actualizacion
- Derecho de arrepentimiento - Disposición 954/2025: https://www.argentina.gob.ar/normativa/nacional/norma-417152
- AAIP - Protección de datos personales: https://www.argentina.gob.ar/aaip/datospersonales
- AAIP - Registro de bases: https://www.argentina.gob.ar/aaip/datospersonales/tramites
- AAIP - Medidas de seguridad, Resolución 47/2018: https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-47-2018-312662/texto
- Mercado Pago - Webhooks: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
- Mercado Pago - Suscripciones: https://www.mercadopago.com.ar/developers/es/docs/subscriptions/overview

