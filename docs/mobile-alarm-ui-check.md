# Alarmas e ingreso en pantallas chicas

Correccion del 29 de octubre de 2026. No modifica permisos, sesiones,
credenciales, datos ni el despacho de notificaciones.

## Fallos reproducidos

- La regla especifica de la anotacion reemplazaba `overflow:auto` por
  `overflow:hidden`: el formulario crecia pero no permitia llegar al final.
- Cuenta se dibujaba por debajo de la anotacion y fuera de la capa superior
  de los editores nativos. El boton Ingresar funcionaba pero no se veia.

## Verificacion

- Cuenta usa un `dialog` modal nativo, con cierre independiente, foco de
  regreso al control de origen y sin borrar la alarma en preparacion.
- Los formularios conservan desplazamiento vertical, contienen el rebote
  hacia el inicio y respetan el espacio seguro inferior.
- `node --test tests/account-modal.test.js tests/account-captcha.test.js`
- `node tests/mobile-alarm-flow.smoke.cjs`
- PowerShell: `$env:TEST_WEBKIT='1'; node tests/mobile-alarm-flow.smoke.cjs`

La prueba de navegador utiliza Playwright ya instalado en `tmp/ui-check`,
un servidor local y cuenta/proveedores simulados. Chrome comprueba un gesto
tactil de arrastre; WebKit comprueba composicion, ingreso, scroll con rueda
y cierre de modales en tamaños de iPhone. No certifica teclado del sistema,
permisos ni entrega de avisos en un iPhone real. Esa prueba sigue pendiente.
