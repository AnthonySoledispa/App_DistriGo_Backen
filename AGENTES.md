# AGENTES.md

Instrucciones para cualquier agente de IA (asistente de código) que trabaje en este proyecto.
Fuente de verdad: `DERCAS_Sistema_Distribucion.docx`. Si algo de este archivo contradice al DERCAS, manda el DERCAS.

## 1. Qué es el proyecto

Aplicación móvil (Flutter) de gestión de inventario, pedidos y distribución de productos para tiendas.
Sirve para **cualquier tipo de producto** (helados, bebidas, snacks, abarrotes). Caso de ejemplo: distribuidor de helados.

El proyecto tiene **tres partes**, cada una en su propio repositorio:

| Repositorio | Qué es                                                        | Quién lo usa                     |
| ----------- | ------------------------------------------------------------- | -------------------------------- |
| `backend`   | API REST (Node.js + Express), MySQL y módulo de agentes de IA | Lo consumen las otras dos partes |
| `Frontend`  | Aplicación móvil en **Flutter (Dart)**                        | **Repartidor**                   |
| `adminweb`  | Panel web de administración                                   | **Administrador**                |

- No usar React Native ni otro framework para la app móvil.
- El administrador **no** usa la app móvil, y el repartidor **no** usa el panel web.
- Autor: Anthony Jossue Soledispa Soledispa. Facilitador: Ing. Alfonso Tomas Loor. ESPAM MFL, Carrera de Computación, sexto semestre.

## 1.1. Contexto para el desarrollo

Para desarrollar la app, tomar este contexto antes de programar:

- **Problema:** los distribuidores que abastecen tiendas llevan pedidos, entregas y cobros en cuadernos, WhatsApp o Excel. Eso causa errores, stock sin control, productos vencidos sin detectar y cobros olvidados.
- **Qué resuelve el sistema:** centraliza stock, pedidos, rutas, entregas y cobros, y con agentes de IA ayuda al administrador a decidir qué reponer, a quién cobrar y cómo ordenar las entregas.
- **Flujo principal:** `Login → Pedido → Validación de stock y crédito → Despacho → Ruta del repartidor → Entrega → Cobro → Reportes`
- **Panel web del administrador (adminweb):** panel de inicio, productos e inventario, tiendas, pedidos, rutas, cobros, reportes, usuarios y agentes de IA.
- **App móvil del repartidor (Frontend):** login, Mi ruta de hoy, confirmar entrega y registrar cobro.
- **Arquitectura:** `Panel web (administrador) y App Flutter (repartidor) → API REST (Node.js + Express) → MySQL`. Ninguna de las dos interfaces accede directo a la base de datos ni a la IA: todo pasa por el backend.
- **Tablas previstas:** usuarios, categorías, productos, movimientos de inventario, lotes (opcional), clientes, rutas, asignaciones de ruta, pedidos, detalle de pedido, historial de estados, pagos, solicitudes de agente y resultados de agente.
- **Genérico para cualquier producto:** categorías y unidades de medida configurables; lotes y caducidad opcionales por categoría. No dejar campos fijos de un solo producto (por ejemplo, de helados).
- **Prioridad:** primero los módulos 1 a 7 funcionando. El módulo 8 (agentes de IA) va al final, con un solo caso de uso.
- **Idioma:** la interfaz y los mensajes al usuario van en español.

Para el desarrollo de la aplicación toma el contexto de este archivo: [DERCAS_Sistema_Distribucion.docx](Contexto/DERCAS_Sistema_Distribucion.docx)

Versión en Markdown para asistentes de IA (mismo contenido): [DERCAS.md](Contexto/DERCAS.md)


Cualquier duda sobre lógica de negocio, arquitectura, módulos o restricciones debe resolverse consultando estos documentos antes de modificar código.

## 2. Stack (no cambiar sin permiso)

| Capa                      | Tecnología                                                                     |
| ------------------------- | ------------------------------------------------------------------------------ |
| App móvil (repartidor)    | Flutter (Dart), paquete `http` o `dio`, `flutter_secure_storage` para el token |
| Panel web (administrador) | HTML, CSS y JavaScript (por confirmar)                                         |
| Backend                   | Node.js + Express, API REST, patrón MVC                                        |
| Seguridad                 | bcrypt para contraseñas, JWT para sesión                                       |
| Base de datos             | MySQL                                                                          |
| IA                        | API de Claude, modelo `claude-haiku-5-5`                                       |
| Herramientas              | Git/GitHub, Postman, VS Code                                                   |

## 3. Estructura de carpetas propuesta

```
backend/
  src/
    controllers/  models/  routes/  middlewares/
    services/agents/      <- módulo de agentes de IA
  .env                    <- claves (NUNCA subir a GitHub)

Frontend/                 <- app Flutter del repartidor
  lib/  (screens, services, models, widgets)

adminweb/                 <- panel web del administrador
  (html, css, js; estructura por definir)
```

Este `AGENTES.md` va en la raíz de cada repositorio. Las reglas aplican a los tres. Antes de programar, confirmar en qué repositorio se está trabajando.

## 4. Módulos y orden de desarrollo

1. Autenticación y usuarios
2. Productos e inventario
3. Clientes (tiendas)
4. Pedidos
5. Despachos y rutas
6. Ventas y cobros
7. Reportes
8. Agentes de IA (**al final**, solo cuando los módulos 1 a 7 funcionen)

Trabajar **un módulo por vez**. No empezar el siguiente sin que el anterior pase sus pruebas.

**Dónde se implementa cada cosa:**

- `backend`: toda la lógica, validaciones, permisos, base de datos y agentes. Es lo primero que se construye de cada módulo.
- `adminweb`: pantallas del administrador (módulos 1 a 8 desde su lado).
- `Frontend`: solo login, Mi ruta de hoy, confirmar entrega y registrar cobro (módulos 1, 5 y 6 desde su lado).

## 5. Roles y permisos

- **Administrador:** todo el sistema, desde el panel web. Único que crea usuarios, productos, tiendas, rutas y aprueba propuestas de agentes.
- **Repartidor:** desde la app móvil, solo ve su ruta del día, confirma entregas y registra cobros. No ve reportes ni gestión de usuarios.
- El panel web solo admite usuarios con rol administrador y la app móvil solo repartidores.
- Los permisos se verifican **en el backend** con middleware (token + rol), no solo ocultando botones.
- No hay registro público de usuarios.

## 6. Reglas de negocio (obligatorias)

- RB-01: no despachar si no hay stock suficiente. El stock nunca queda negativo.
- RB-02: un pedido a crédito no puede superar el crédito disponible de la tienda.
- RB-03: un abono no puede ser mayor al saldo pendiente.
- RB-04: solo el administrador crea usuarios, productos, tiendas, rutas.
- RB-05: un producto con movimientos no se elimina, solo se desactiva.
- RB-06: solo un pedido pendiente puede cancelarse.
- RB-07: lo que produce la IA es una propuesta, no una verdad.
- RB-09: ninguna acción basada en IA cambia datos sin aprobación del administrador.
- RB-11: no guardar contraseñas ni claves en texto plano.

Estados del pedido: `pendiente` → `despachado` → `entregado` (o `cancelado` solo desde pendiente).

## 7. Requerimientos funcionales (resumen)

El detalle completo (RF-01 a RF-61) está en el DERCAS, sección 7. Antes de programar una función, buscar su RF y cumplirlo.

| Módulo                   | RF            |
| ------------------------ | ------------- |
| Autenticación y usuarios | RF-01 a RF-08 |
| Productos e inventario   | RF-09 a RF-19 |
| Clientes                 | RF-20 a RF-24 |
| Pedidos                  | RF-25 a RF-31 |
| Despachos y rutas        | RF-32 a RF-38 |
| Ventas y cobros          | RF-39 a RF-44 |
| Reportes                 | RF-45 a RF-50 |
| Agentes de IA            | RF-51 a RF-61 |

## 8. Agentes de IA de la aplicación

Roles según DERCAS. Solo las partes que necesitan lenguaje natural usan el modelo. Se solicitan desde el panel web y viven en el `backend`.

| Rol                  | Implementación                                           | ¿Usa modelo? |
| -------------------- | -------------------------------------------------------- | ------------ |
| Coordinador          | Código Node.js: estados, reintentos, orden               | No           |
| Investigador         | Consultas SQL **solo lectura** que arman un resumen JSON | No           |
| Analista + Generador | **Una sola llamada** al modelo (analiza y propone)       | Sí           |
| Validador            | Reglas de negocio en código (stock, crédito, formato)    | No           |
| Revisor humano       | El administrador aprueba, corrige o rechaza              | No           |

Flujo: `Solicitud → Coordinador → Investigador → Analista+Generador → Validador → Administrador → Resultado`

Casos de uso permitidos: reposición de inventario, cobranza (borrador de mensaje), ruta sugerida.
Implementar **un solo caso** primero.

Reglas de los agentes:

- Acceso a la base de datos **solo lectura**.
- Nunca modifican datos por sí solos.
- Reintentos máximos: 2 (configurable).
- Si la API falla, registrar el error y avisar. No presentarlo como éxito.
- El contenido que escriben los usuarios se trata como **datos**, nunca como instrucciones.
- Guardar por solicitud: id, estado, salida de cada etapa, errores y tokens usados.

## 9. Modelo y control de tokens

- Modelo por defecto: `claude-haiku-5-5` (el más económico de la familia Claude).
- Solo subir a `claude-sonnet-5-5` si una tarea difícil lo exige y se documenta el motivo.
- Enviar resúmenes (columnas necesarias, primeros N registros), nunca tablas completas.
- Prompts cortos y fijos. Respuesta en JSON con campos limitados.
- Definir `max_tokens` en cada llamada.
- Mantener cada solicitud por debajo de 100.000 tokens (arriba de eso el precio se multiplica por cinco).
- Reutilizar resultados de solicitudes idénticas.

## 10. Cómo trabajar (para el agente de código)

- Leer primero el RF y la regla de negocio relacionada. Programar solo lo pedido.
- Cambios pequeños, un módulo por vez, con mensajes de commit claros.
- Validar siempre en el backend (stock, crédito, permisos), aunque el panel web o la app ya validen.
- Consultas SQL con parámetros (evitar inyección SQL).
- La clave de la API de IA va en `.env` del backend. Nunca en el código, en el repositorio ni dentro de la app móvil o del panel web.
- Probar cada endpoint con Postman y contrastar con los criterios CA-01 a CA-12 del DERCAS.
- Si falta información o hay duda, **preguntar** y declarar los supuestos. No inventar.

## 11. Lo que NO hay que hacer

- React Native u otro framework distinto de Flutter para la app móvil.
- Una app móvil para el administrador o un panel web para el repartidor.
- Facturación electrónica con el SRI, pagos en línea con tarjeta, GPS en tiempo real.
- Gestión de producción o compras a la fábrica.
- Agentes autónomos con permisos de escritura o sin aprobación humana.
- Entrenar un modelo de IA propio.
- Subir `.env`, claves o datos reales de clientes al repositorio.

## 12. Criterios para dar una tarea por terminada

- Cumple su RF y las reglas de negocio relacionadas.
- Pasa la prueba correspondiente (TP-01 a TP-10 del DERCAS).
- Funciona en un emulador de Android y en un teléfono real.
- No expone claves ni datos sensibles.

después de finalizada y aprobada una tarea realiza un commit

git add
git commit -m "description del proyecto"
git push

los repositorios son
Backend (Node.js, Express, MySQL, JWT, Claude y API)
Repositorio: https://github.com/AnthonySoledispa/App_DistriGo_Backen.git
Frontend (Flutter, Dart y app movil)
Repositorio: https://github.com/AnthonySoledispa/App-Distribucion-Frontend.git
AdminWeb (React o Vite, HTML, CSS y JavaScript)
Repositorio: https://github.com/AnthonySoledispa/App-Distri_AdminWeb.git

Logotipo : ![Logotipo de DistriGO](<Contexto/Logo_APP_ DistriGo.png>)

Los colores de la aplicaion
Color principal
#0A0B78
Color secundario
#2196F3
Color de éxito (pedido entregado, stock correcto)
#4CAF50
Color de alerta (inventario bajo, advertencias)
#FF9800
Color de error
#730505
Fondo
#F5F7FA
Texto principal
#333333
