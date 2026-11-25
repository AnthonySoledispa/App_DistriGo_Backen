# DERCAS: sistema de gestión de inventario, pedidos y distribución de productos para tiendas, con panel web, aplicación móvil y agentes de IA

> Especificaciones, requerimientos y criterios de aceptación de software.
> Versión en Markdown del documento `DERCAS_Sistema_Distribucion.docx`, para leerlo en VS Code, GitHub y asistentes de IA.

- **Autor:** Anthony Jossue Soledispa Soledispa
- **Facilitador:** Ing. Alfonso Tomas Loor
- **Institución:** Escuela Superior Politécnica Agropecuaria de Manabí Manuel Félix López (ESPAM MFL)
- **Carrera y materia:** Computación, sexto semestre. Trabajo formativo de Desarrollo de Aplicaciones para Dispositivos Móviles
- **Lugar y fecha:** Calceta, noviembre 2026

# Control del documento

| **Versión** | **Fecha**  | **Descripción del cambio**                                                                                                      | **Responsable**   |
|-------------|------------|---------------------------------------------------------------------------------------------------------------------------------|-------------------|
| 1.0         | 05/11/2026 | Versión inicial DERCAS del sistema de gestión de inventario, pedidos y distribución con agentes de IA.                          | Anthony Soledispa |
| 1.1         | 22/11/2026 | Se incorpora el panel web de administración (AdminWeb): el administrador usa el panel web y el repartidor la app móvil Flutter. | Anthony Soledispa |

## Contenido

1. Introducción
2. Descripción del problema y propuesta de solución
3. Objetivos y alcance
4. Participantes y actores
5. Descripción general de la solución
6. Módulos y tareas de desarrollo
7. Requerimientos funcionales
8. Requerimientos no funcionales
9. Reglas de negocio y restricciones
10. Flujo general del proceso
11. Agentes de IA y modelo de lenguaje
12. Tecnologías y herramientas
13. Criterios de aceptación
14. Datos, integraciones y seguridad
15. Pruebas y validación
16. Riesgos y mitigaciones
17. Plan de trabajo por fases
18. Entregables
19. Aprobación del documento
20. Glosario y referencias

# 1. Introducción

DERCAS significa Documento de Especificaciones, Requerimientos y Criterios de Aceptación de Software. Este documento define qué debe hacer el sistema, quién lo utilizará, cuáles son sus restricciones y cómo se comprobará que la solución cumple lo acordado.

Aquí se aplica la metodología DERCAS al proyecto **sistema de gestión de inventario, pedidos y distribución de productos para tiendas**. El sistema sirve para cualquier tipo de producto de consumo (helados, bebidas, snacks, abarrotes, etc.). El caso de ejemplo para las pruebas y demostraciones es un distribuidor de helados.

**Aclaración importante:** el proyecto tiene tres partes, cada una en su propio repositorio: **Backend** (API REST en Node.js con MySQL y módulo de agentes de IA), **Frontend** (aplicación móvil en Flutter para el repartidor) y **AdminWeb** (panel web para el administrador).

Es una propuesta inicial. El proveedor del modelo de IA, el presupuesto y los detalles finales del alcance deben confirmarse antes de iniciar el desarrollo.

# 2. Descripción del problema y propuesta de solución

## 2.1. Situación actual / problema

Los distribuidores que abastecen a tiendas de barrio suelen llevar pedidos, entregas y cobros en cuadernos, WhatsApp o Excel. Esto provoca errores en los pedidos, pérdida de control del stock, productos vencidos sin detectar y cuentas por cobrar olvidadas.

## 2.2. Situación deseable

Contar con un sistema que centralice la información: cuánto producto hay en bodega, qué pidió cada tienda, qué se entregó, cuánto se cobró y cuánto se debe. Además, que ayude al administrador a decidir qué reponer, a quién cobrar y cómo ordenar las entregas.

## 2.3. Propuesta de solución

Desarrollar un sistema con tres partes: un **panel web (AdminWeb)** para el administrador, una **aplicación móvil en Flutter** para el repartidor y un **backend** propio con arquitectura cliente-servidor de tres capas (presentación, lógica de negocio y datos). Se agrega un **módulo de agentes de IA** que analiza los datos del negocio y **propone** acciones (reposición, cobranza, rutas). Ninguna propuesta se aplica sin la aprobación del administrador.

Para que el sistema sirva a cualquier producto, se aplican tres decisiones de diseño:

- Las **categorías** de productos y las **unidades de medida** son configurables (unidad, caja, litro, paquete).
- El **control de lotes y caducidad es opcional** y se activa solo en las categorías que lo necesitan.
- No hay campos fijos de un solo negocio: el nombre del negocio y los datos del distribuidor son configurables.

# 3. Objetivos y alcance

## 3.1. Objetivo general

Desarrollar un sistema (panel web, aplicación móvil y backend) que permita gestionar el inventario, los pedidos, las rutas de reparto y los cobros de un distribuidor de productos a tiendas, incorporando agentes de IA de apoyo a la decisión bajo supervisión humana.

## 3.2. Objetivos específicos

- Controlar el inventario de productos con alertas de stock bajo y de caducidad.
- Registrar tiendas clientes con ruta y límite de crédito, y tomar pedidos validando stock y crédito.
- Organizar las rutas de reparto por día y permitir al repartidor confirmar entregas y registrar cobros.
- Llevar el control de cobros: contado, crédito, abonos y saldos pendientes.
- Generar reportes de ventas, stock y cuentas por cobrar.
- Incorporar agentes de IA que propongan acciones, con validación y aprobación humana, controlando el consumo de tokens.

## 3.3. Alcance incluido

- Inicio de sesión con roles: el administrador en el panel web y el repartidor en la app móvil.
- Panel web de administración (AdminWeb) para el administrador.
- Aplicación móvil en Flutter para el repartidor (ruta del día, entregas y cobros).
- Registro y control de inventario de productos.
- Registro de tiendas clientes con dirección, ruta y límite de crédito.
- Toma de pedidos y generación de notas de entrega.
- Control de cobros: contado, crédito, abonos y saldos pendientes.
- Organización de rutas de reparto por día.
- Reportes de ventas, stock y cuentas por cobrar.
- Módulo de agentes de IA con aprobación humana.

## 3.4. Fuera del alcance inicial

- Aplicación móvil para el administrador (el administrador usa el panel web).
- Facturación electrónica oficial conectada al SRI.
- Pagos en línea con tarjeta.
- GPS y seguimiento en tiempo real.
- Gestión de producción o compras a la fábrica.
- Agentes autónomos con permisos ilimitados o que ejecuten cambios sin aprobación.
- Entrenamiento de un modelo de IA propio.

# 4. Participantes y actores

| **Actor**                                  | **Descripción**                                                                    | **Responsabilidades**                                                                                                                             |
|--------------------------------------------|------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| **Administrador** (también revisor humano) | Dueño o encargado del negocio de distribución. Usa el panel web (AdminWeb).        | Configura el sistema, gestiona usuarios, productos, tiendas, pedidos, rutas y reportes. Aprueba, corrige o rechaza las propuestas de los agentes. |
| **Repartidor**                             | Persona que entrega los pedidos en las tiendas. Usa la aplicación móvil (Flutter). | Consulta su ruta del día, confirma entregas y registra cobros.                                                                                    |
| **Tienda cliente**                         | Negocio que compra al distribuidor. Actor externo: no usa el sistema.              | Hace pedidos al administrador y paga al contado, a crédito o con abonos.                                                                          |
| **Agente coordinador**                     | Componente que administra el flujo de los agentes.                                 | Dividir la tarea, controlar estados y reintentos, y reunir resultados.                                                                            |
| **Agente investigador**                    | Componente que recopila datos del sistema.                                         | Consultar stock, ventas, saldos y caducidades en modo solo lectura.                                                                               |
| **Agente analista**                        | Componente que examina los datos.                                                  | Detectar patrones, riesgos e inconsistencias.                                                                                                     |
| **Agente generador de propuesta**          | Componente que redacta la propuesta.                                               | Preparar la lista de reposición, el mensaje de cobranza o la ruta sugerida.                                                                       |
| **Agente validador**                       | Componente que revisa la propuesta.                                                | Comprobar reglas de negocio (stock, crédito) y criterios de aceptación.                                                                           |

# 5. Descripción general de la solución

## 5.1. Arquitectura cliente-servidor de tres capas

| **Capa**                               | **Función**                                                                                                       | **Tecnología**                         |
|----------------------------------------|-------------------------------------------------------------------------------------------------------------------|----------------------------------------|
| **Presentación: panel web (AdminWeb)** | Interfaz web del administrador, usada desde el navegador de una computadora.                                      | HTML, CSS y JavaScript (por confirmar) |
| **Presentación: app móvil**            | Aplicación del repartidor, usada desde el celular.                                                                | Flutter (Dart)                         |
| **Lógica de negocio (backend)**        | API REST con patrón MVC. Valida stock y crédito, calcula totales, maneja seguridad, roles y el módulo de agentes. | Node.js con Express                    |
| **Datos**                              | Base de datos relacional con las tablas del sistema.                                                              | MySQL                                  |
| **Servicio externo de IA**             | Modelo de lenguaje que usan los agentes, llamado solo desde el backend.                                           | API de Claude (Claude Haiku 5.5)       |

## 5.2. Esquema general

**Administrador → Login → Panel web (AdminWeb) → API REST (backend) → Base de datos MySQL**

**Repartidor → Login → App móvil (Flutter) → API REST (backend) → Base de datos MySQL**

**Módulo de agentes (en el backend) → API del modelo de IA → Validador → Aprobación del administrador**

Ni el panel web ni la app móvil hablan directamente con la base de datos ni con el modelo de IA: todo pasa por el backend. Así se protegen las claves y se aplican los permisos.

# 6. Módulos y tareas de desarrollo

El sistema se divide en ocho módulos. Para cada uno se indican las tareas de desarrollo. Las pantallas del administrador se construyen en el panel web (AdminWeb) y las del repartidor en la app móvil (Flutter). Ambas se conectan con la misma API del backend.

### Módulo 1. Autenticación y usuarios

**Funcionalidades:** Inicio de sesión, roles y permisos, gestión de usuarios.

**Tareas:**

- Crear el proyecto del panel web (AdminWeb) y configurar su conexión con la API del backend.
- Crear el proyecto Flutter de la app móvil y configurar su conexión con la API del backend.
- Crear la tabla usuarios (id, nombre, correo, contraseña cifrada, rol, estado).
- Programar los endpoints de login y de gestión de usuarios.
- Cifrar contraseñas y generar token de sesión (JWT).
- Crear el middleware que verifica el token y el rol en cada petición.
- Diseñar la pantalla de login y la pantalla de gestión de usuarios.

### Módulo 2. Productos e inventario

**Funcionalidades:** Registrar productos y precios, entradas de mercadería, salidas por despacho, alerta de stock bajo, control de lotes y caducidad.

**Tareas:**

- Crear las tablas categorías, productos, movimientos de inventario y lotes.
- Programar el CRUD de categorías y productos.
- Programar las entradas de mercadería y los ajustes con motivo.
- Programar las alertas de stock mínimo y de caducidad próxima.
- Diseñar las pantallas de productos, entradas, movimientos y alertas.

### Módulo 3. Clientes (tiendas)

**Funcionalidades:** Registrar tiendas, dirección, contacto, ruta asignada, límite de crédito, historial de compras.

**Tareas:**

- Crear la tabla clientes.
- Programar el CRUD de tiendas con búsqueda por nombre o ruta.
- Calcular el saldo pendiente y el crédito disponible de cada tienda.
- Diseñar la lista de tiendas y la ficha de cada tienda con su historial.

### Módulo 4. Pedidos

**Funcionalidades:** Crear pedido por tienda, validar stock, estados del pedido.

**Tareas:**

- Crear las tablas pedidos, detalle de pedido e historial de estados.
- Programar la creación de pedidos con validación de stock y de crédito en una sola transacción.
- Programar los cambios de estado y su historial.
- Diseñar las pantallas de crear pedido y de lista de pedidos con filtros.

### Módulo 5. Despachos y rutas

**Funcionalidades:** Asignar tiendas a rutas por día, lista de entrega para el repartidor, confirmar entrega, nota de entrega.

**Tareas:**

- Crear las tablas rutas, tiendas por ruta y asignaciones de repartidor.
- Programar el despacho (asigna ruta, descuenta stock, cambia estado).
- Programar la lista de entregas del repartidor y la confirmación de entrega.
- Generar la nota de entrega en PDF.
- Construir en Flutter la pantalla Mi ruta de hoy.

### Módulo 6. Ventas y cobros

**Funcionalidades:** Generar nota de entrega, registrar pagos, manejar crédito, saldos por cobrar y abonos.

**Tareas:**

- Crear la tabla pagos.
- Programar el registro de pagos al contado, a crédito y abonos.
- Actualizar el saldo de la tienda con cada pago.
- Diseñar las pantallas de registro de cobro y de cuentas por cobrar.

### Módulo 7. Reportes

**Funcionalidades:** Ventas por tienda, producto o ruta, stock actual, cuentas por cobrar, productos más vendidos.

**Tareas:**

- Escribir las consultas SQL de cada reporte.
- Programar los endpoints de reportes con filtro por fechas.
- Crear el panel de inicio del administrador.
- Exportar reportes a PDF.

### Módulo 8. Agentes de IA

**Funcionalidades:** Solicitudes a agentes, ejecución coordinada, validación y aprobación humana.

**Tareas:**

- Crear las tablas solicitudes de agente y resultados de agente.
- Programar el coordinador (flujo secuencial con límite de reintentos).
- Programar las consultas de solo lectura del agente investigador.
- Escribir los prompts del analista y del generador, y la conexión con la API del modelo.
- Programar el validador con reglas de negocio en código.
- Registrar estados, errores y consumo de tokens de cada solicitud.
- Diseñar la pantalla de solicitud, resultado y aprobación.

# 7. Requerimientos funcionales

Cada requerimiento describe algo que el sistema debe hacer y se puede comprobar con una prueba. Prioridad: Alta (indispensable), Media (importante), Baja (deseable).

### Módulo 1. Autenticación y usuarios

| **ID** | **Requerimiento**                                                                                                                                                                                                                                                                         | **Prioridad** |
|--------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| RF-01  | El sistema deberá permitir iniciar sesión con correo y contraseña.                                                                                                                                                                                                                        | Alta          |
| RF-02  | Si las credenciales son incorrectas, el sistema deberá mostrar un mensaje de error sin indicar cuál dato falló.                                                                                                                                                                           | Alta          |
| RF-03  | El sistema deberá guardar las contraseñas cifradas, nunca en texto plano.                                                                                                                                                                                                                 | Alta          |
| RF-04  | Cada usuario deberá tener un rol: administrador o repartidor.                                                                                                                                                                                                                             | Alta          |
| RF-05  | El administrador deberá iniciar sesión en el panel web y llegar al panel principal. El repartidor deberá iniciar sesión en la app móvil y llegar a su pantalla Mi ruta de hoy. El panel web solo admitirá usuarios con rol administrador y la app móvil solo usuarios con rol repartidor. | Alta          |
| RF-06  | El backend deberá bloquear toda función que no corresponda al rol del usuario, aunque intente llamar a la función directamente.                                                                                                                                                           | Alta          |
| RF-07  | Solo el administrador podrá crear, editar, activar y desactivar usuarios. No habrá registro público.                                                                                                                                                                                      | Alta          |
| RF-08  | El sistema deberá permitir cerrar sesión y deberá cerrarla automáticamente tras un tiempo de inactividad configurable.                                                                                                                                                                    | Media         |

### Módulo 2. Productos e inventario

| **ID** | **Requerimiento**                                                                                                     | **Prioridad** |
|--------|-----------------------------------------------------------------------------------------------------------------------|---------------|
| RF-09  | El administrador podrá registrar un producto con nombre, categoría, unidad de medida, precio de venta y stock mínimo. | Alta          |
| RF-10  | El administrador podrá crear y editar categorías y unidades de medida.                                                | Alta          |
| RF-11  | El administrador podrá editar y desactivar productos. Un producto con movimientos no podrá eliminarse.                | Alta          |
| RF-12  | El administrador podrá registrar entradas de mercadería (producto, cantidad, fecha), lo que aumenta el stock.         | Alta          |
| RF-13  | El sistema deberá descontar el stock automáticamente cuando un pedido se despacha.                                    | Alta          |
| RF-14  | El sistema deberá mostrar el stock actual de cada producto.                                                           | Alta          |
| RF-15  | El sistema deberá mostrar una alerta cuando el stock de un producto sea igual o menor a su stock mínimo.              | Alta          |
| RF-16  | El sistema deberá permitir activar, por categoría, el control de lotes y fecha de caducidad.                          | Media         |
| RF-17  | El sistema deberá alertar sobre los lotes que caducan dentro de un número de días configurable.                       | Media         |
| RF-18  | El administrador podrá registrar ajustes de inventario con un motivo (daño, pérdida, merma).                          | Media         |
| RF-19  | El sistema deberá guardar y mostrar el historial de movimientos de inventario de cada producto.                       | Media         |

### Módulo 3. Clientes (tiendas)

| **ID** | **Requerimiento**                                                                                                         | **Prioridad** |
|--------|---------------------------------------------------------------------------------------------------------------------------|---------------|
| RF-20  | El administrador podrá registrar una tienda con nombre, contacto, teléfono, dirección, ruta asignada y límite de crédito. | Alta          |
| RF-21  | El administrador podrá editar y desactivar tiendas.                                                                       | Alta          |
| RF-22  | El sistema deberá permitir buscar tiendas por nombre o por ruta.                                                          | Media         |
| RF-23  | El sistema deberá mostrar, por cada tienda, su saldo pendiente y su crédito disponible.                                   | Alta          |
| RF-24  | El sistema deberá mostrar el historial de compras de cada tienda.                                                         | Media         |

### Módulo 4. Pedidos

| **ID** | **Requerimiento**                                                                                                          | **Prioridad** |
|--------|----------------------------------------------------------------------------------------------------------------------------|---------------|
| RF-25  | El administrador podrá crear un pedido eligiendo una tienda y los productos con sus cantidades.                            | Alta          |
| RF-26  | El sistema deberá validar el stock disponible y no aceptar el pedido si es insuficiente, indicando la cantidad disponible. | Alta          |
| RF-27  | Si el pedido es a crédito, el sistema deberá validar que no supere el límite de crédito de la tienda.                      | Alta          |
| RF-28  | El sistema deberá calcular automáticamente el subtotal de cada línea y el total del pedido.                                | Alta          |
| RF-29  | Un pedido tendrá los estados pendiente, despachado y entregado. Solo un pedido pendiente podrá cancelarse.                 | Alta          |
| RF-30  | El sistema deberá registrar cada cambio de estado con fecha, hora y usuario que lo hizo.                                   | Media         |
| RF-31  | El sistema deberá permitir filtrar los pedidos por estado, fecha y tienda.                                                 | Media         |

### Módulo 5. Despachos y rutas

| **ID** | **Requerimiento**                                                                                                                                                          | **Prioridad** |
|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| RF-32  | El administrador podrá crear rutas con un nombre y un día de visita.                                                                                                       | Alta          |
| RF-33  | El administrador podrá asignar tiendas a una ruta.                                                                                                                         | Alta          |
| RF-34  | El administrador podrá asignar un repartidor a una ruta para un día.                                                                                                       | Alta          |
| RF-35  | El administrador podrá despachar un pedido pendiente: se asigna la ruta, se descuenta el stock y el estado pasa a despachado.                                              | Alta          |
| RF-36  | El repartidor solo deberá ver la lista de entregas que le corresponden en el día.                                                                                          | Alta          |
| RF-37  | El repartidor podrá confirmar una entrega y el pedido pasará a entregado.                                                                                                  | Alta          |
| RF-38  | El sistema deberá generar una nota de entrega con número, fecha, tienda, detalle de productos y total, descargable en PDF desde el panel web y visible desde la app móvil. | Alta          |

### Módulo 6. Ventas y cobros

| **ID** | **Requerimiento**                                                                          | **Prioridad** |
|--------|--------------------------------------------------------------------------------------------|---------------|
| RF-39  | El sistema deberá permitir indicar si un pedido se paga al contado o a crédito.            | Alta          |
| RF-40  | El sistema deberá permitir registrar un pago o abono con monto, fecha y usuario que cobró. | Alta          |
| RF-41  | El sistema deberá actualizar el saldo pendiente de la tienda después de cada pago.         | Alta          |
| RF-42  | El sistema no deberá aceptar un abono mayor al saldo pendiente.                            | Alta          |
| RF-43  | El administrador podrá consultar las cuentas por cobrar de cada tienda.                    | Alta          |
| RF-44  | El repartidor podrá registrar el cobro al momento de confirmar la entrega.                 | Media         |

### Módulo 7. Reportes

| **ID** | **Requerimiento**                                                                                                                    | **Prioridad** |
|--------|--------------------------------------------------------------------------------------------------------------------------------------|---------------|
| RF-45  | El sistema deberá generar reportes de ventas por tienda, por producto y por ruta, en un rango de fechas.                             | Alta          |
| RF-46  | El sistema deberá generar el reporte de stock actual.                                                                                | Alta          |
| RF-47  | El sistema deberá generar el reporte de cuentas por cobrar.                                                                          | Alta          |
| RF-48  | El sistema deberá mostrar los productos más vendidos.                                                                                | Media         |
| RF-49  | El panel web deberá permitir exportar los reportes a PDF.                                                                            | Media         |
| RF-50  | El panel de inicio del administrador deberá mostrar ventas del día, pedidos pendientes, productos con stock bajo y total por cobrar. | Media         |

### Módulo 8. Agentes de IA

| **ID** | **Requerimiento**                                                                                                                       | **Prioridad** |
|--------|-----------------------------------------------------------------------------------------------------------------------------------------|---------------|
| RF-51  | El administrador podrá crear una solicitud a los agentes indicando objetivo, contexto y formato esperado (reposición, cobranza o ruta). | Alta          |
| RF-52  | El sistema deberá verificar que los campos obligatorios estén completos antes de ejecutar la solicitud.                                 | Alta          |
| RF-53  | El coordinador deberá dividir la solicitud en subtareas y ejecutarlas en secuencia.                                                     | Alta          |
| RF-54  | El agente investigador solo podrá leer datos de la base de datos y enviar al modelo un resumen, no tablas completas.                    | Alta          |
| RF-55  | El analista y el generador deberán devolver un resultado estructurado (formato JSON) con la propuesta.                                  | Alta          |
| RF-56  | El validador deberá comprobar la propuesta con las reglas de negocio (stock, crédito) y con los criterios configurados.                 | Alta          |
| RF-57  | Si la validación falla, el sistema deberá registrar los motivos y reintentar hasta un máximo configurable (por defecto 2).              | Alta          |
| RF-58  | El sistema deberá guardar el estado y la salida de cada etapa, vinculados a la solicitud correcta.                                      | Alta          |
| RF-59  | El sistema deberá mostrar el resultado con sus limitaciones y permitir al administrador aprobar, pedir corrección o rechazar.           | Alta          |
| RF-60  | Ningún agente podrá modificar datos del sistema sin la aprobación expresa del administrador.                                            | Alta          |
| RF-61  | El sistema deberá registrar los errores y el consumo de tokens de cada solicitud.                                                       | Media         |

# 8. Requerimientos no funcionales

| **ID**                    | **Requerimiento**                                                                                                                                                                 | **Criterio verificable propuesto**                                                               |
|---------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| **RNF-01 Seguridad**      | El acceso a cada función deberá estar restringido según el rol.                                                                                                                   | Un repartidor que intente abrir una función de administrador recibe un error de acceso denegado. |
| **RNF-02 Privacidad**     | Se enviará al modelo de IA solo la información necesaria.                                                                                                                         | Los datos que van al modelo no incluyen contraseñas, claves ni datos personales innecesarios.    |
| **RNF-03 Trazabilidad**   | Pedidos, pagos y solicitudes a agentes tendrán identificador e historial.                                                                                                         | Se puede consultar quién hizo cada cambio y cuándo.                                              |
| **RNF-04 Mantenibilidad** | Código organizado por capas (modelo, vista, controlador) y con el módulo de agentes separado.                                                                                     | Se puede cambiar el modelo de IA modificando solo el módulo de agentes.                          |
| **RNF-05 Usabilidad**     | La app móvil tendrá pantallas pensadas para el celular y botones de tamaño cómodo. El panel web se adaptará a pantallas de computadora. Ambos mostrarán mensajes claros de error. | El repartidor completa una entrega en pocos toques.                                              |
| **RNF-06 Compatibilidad** | La app móvil funcionará en teléfonos Android actuales y el panel web en navegadores actuales.                                                                                     | Pruebas correctas en el emulador de Android, en un teléfono real y en Chrome, Edge y Firefox.    |
| **RNF-07 Robustez**       | Se manejarán fallos de la base de datos y de la API de IA.                                                                                                                        | Un fallo se registra y el sistema informa que la tarea no se completó.                           |
| **RNF-08 Rendimiento**    | Las pantallas principales responderán con rapidez. Umbral propuesto: menos de 3 segundos con datos de prueba.                                                                     | Medición con Postman y con las aplicaciones durante las pruebas.                                 |
| **RNF-09 Costo de IA**    | El consumo de tokens estará controlado.                                                                                                                                           | Cada solicitud registra sus tokens y respeta el límite de reintentos y de tamaño de entrada.     |

# 9. Reglas de negocio y restricciones

- **RB-01:** no se puede despachar un pedido si no hay stock suficiente. El stock nunca puede quedar negativo.
- **RB-02:** un pedido a crédito no puede superar el crédito disponible de la tienda.
- **RB-03:** un abono no puede ser mayor que el saldo pendiente.
- **RB-04:** solo el administrador puede crear usuarios, productos, tiendas, rutas y aprobar propuestas de agentes.
- **RB-05:** un producto con movimientos de inventario no se elimina, solo se desactiva.
- **RB-06:** solo un pedido en estado pendiente puede cancelarse.
- **RB-07:** los resultados de los agentes son propuestas generadas por IA y no se consideran verdaderos automáticamente.
- **RB-08:** los agentes tienen una función delimitada y acceso de solo lectura a los datos.
- **RB-09:** cualquier acción que cambie datos importantes a partir de una propuesta de IA requiere aprobación humana.
- **RB-10:** el número de reintentos de los agentes tiene un límite configurable.
- **RB-11:** el sistema no guarda contraseñas ni claves de API en texto plano.
- **RB-12:** cuando faltan datos esenciales, el sistema pide aclaración o declara sus supuestos.

# 10. Flujo general del proceso

## 10.1. Cómo comienza: configuración inicial

1. El administrador inicia sesión en el panel web (el primer usuario administrador se crea al instalar el sistema).
2. Crea los usuarios repartidores.
3. Configura las categorías de productos y las unidades de medida.
4. Registra los productos con su precio y el stock inicial.
5. Registra las tiendas con dirección, contacto, ruta y límite de crédito.
6. Crea las rutas de reparto y los días de visita.

## 10.2. Operación diaria

**Login → Pedido → Validación de stock y crédito → Despacho → Ruta del repartidor → Entrega → Cobro → Reportes**

1. **Inicio de sesión:** el administrador entra al panel web y el repartidor a la app móvil, cada uno a su pantalla principal.
2. **Pedido:** el administrador crea el pedido de una tienda en el panel web. Estado: pendiente.
3. **Validación:** el sistema revisa stock y límite de crédito. Si algo falla, muestra el motivo y no deja continuar.
4. **Despacho:** el pedido se asigna a una ruta y a un repartidor, se descuenta el stock y se genera la nota de entrega. Estado: despachado.
5. **Ruta del día:** el repartidor ve en su celular las entregas que le tocan.
6. **Entrega:** el repartidor confirma la entrega en la app móvil. Estado: entregado.
7. **Cobro:** se registra el pago al contado o se deja a crédito. Los abonos reducen el saldo.
8. **Reportes:** el administrador consulta ventas, stock y cuentas por cobrar en el panel web.

## 10.3. Flujo de los agentes de IA

**Solicitud → Coordinador → Investigador → Analista y generador → Validador → Revisión del administrador → Resultado final**

1. El administrador registra una solicitud en el panel web (por ejemplo: «qué debo reponer esta semana»).
2. El sistema valida que los campos obligatorios estén completos.
3. El coordinador crea la solicitud con un identificador y estado en ejecución.
4. El investigador consulta la base de datos (solo lectura) y arma un resumen breve.
5. El analista y el generador usan el modelo de IA para analizar el resumen y preparar la propuesta.
6. El validador revisa la propuesta con las reglas de negocio. Si hay incumplimientos, el coordinador pide una corrección dentro del límite de reintentos.
7. El sistema muestra la propuesta, sus limitaciones y el estado de validación.
8. El administrador aprueba, pide corrección o rechaza. Solo si aprueba se aplica alguna acción.

# 11. Agentes de IA y modelo de lenguaje

## 11.1. Roles de los agentes y cómo se implementan

Los roles vienen de la metodología DERCAS. Para gastar menos tokens, solo las partes que realmente necesitan lenguaje natural usan el modelo; las demás son código normal.

| **Rol**                  | **Implementación**                                           | **¿Usa modelo?** | **Entrada → Salida**                             |
|--------------------------|--------------------------------------------------------------|------------------|--------------------------------------------------|
| **Coordinador**          | Código del backend (Node.js)                                 | No               | Solicitud validada → plan, estados y reintentos  |
| **Investigador**         | Consultas SQL de solo lectura                                | No               | Tipo de solicitud → resumen de datos en JSON     |
| **Analista y generador** | Una sola llamada al modelo, con dos pasos en el mismo prompt | Sí               | Resumen de datos → hallazgos y propuesta en JSON |
| **Validador**            | Reglas de negocio en código (stock, crédito, formato)        | No               | Propuesta → criterios cumplidos e incumplidos    |
| **Revisor humano**       | Administrador                                                | No               | Resultado → aprobar, corregir o rechazar         |

Si en las pruebas se necesita más control, el analista y el generador pueden separarse en dos llamadas.

## 11.2. Modelo elegido: Claude Haiku 5.5

Se propone **Claude Haiku 5.5** (identificador claude-haiku-5-5) como modelo por defecto, porque es el modelo más económico de la familia Claude y las tareas del sistema son acotadas (resumir datos, detectar patrones, redactar propuestas cortas).

| **Modelo**           | **Entrada (por millón de tokens)** | **Salida (por millón de tokens)** | **Uso en el proyecto**                         |
|----------------------|------------------------------------|-----------------------------------|------------------------------------------------|
| **Claude Haiku 5.5** | US\$ 0,10                          | US\$ 0,50                         | Modelo por defecto para todas las solicitudes. |
| Claude Sonnet 5.5    | US\$ 2                             | US\$ 10                           | Solo si Haiku no alcanza en una tarea difícil. |
| Claude Opus 5.5      | US\$ 4                             | US\$ 20                           | No se usa en este proyecto.                    |

*Precios de la documentación de Anthropic al 05/11/2026; deben confirmarse antes de implementar. Los precios de Haiku 5.5 aplican a prompts de hasta 100.000 tokens: por encima de ese tamaño los precios se multiplican por cinco.*

**Estimación de costo:** una solicitud típica con 3.000 tokens de entrada y 800 de salida cuesta unos US\$ 0,0007 con Haiku 5.5, es decir, menos de un centavo. Con Sonnet 5.5 costaría unos US\$ 0,014.

## 11.3. Medidas para gastar menos tokens

- Enviar al modelo un **resumen** (columnas necesarias y los primeros N registros), nunca tablas completas.
- Mantener los prompts **cortos y fijos**, y pedir la respuesta en **JSON con campos limitados**.
- Definir **max_tokens** para limitar el largo de la respuesta.
- Usar **código en lugar de IA** para el investigador, el validador y el coordinador.
- Limitar los **reintentos** (máximo 2 por defecto).
- Reutilizar resultados de solicitudes idénticas y usar **caché de prompts** para las instrucciones fijas.
- Mantener cada solicitud por debajo de los 100.000 tokens.
- Registrar los tokens de cada solicitud para medir y ajustar.

Las instrucciones completas para el agente de desarrollo y la definición de los agentes están en el archivo **AGENTES.md** que acompaña a este documento.

# 12. Tecnologías y herramientas

| **Uso**                   | **Tecnología**                                                             | **Motivo**                                                             |
|---------------------------|----------------------------------------------------------------------------|------------------------------------------------------------------------|
| **Panel web (AdminWeb)**  | HTML, CSS y JavaScript (por confirmar)                                     | Interfaz web del administrador, desde el navegador de una computadora. |
| **App móvil**             | Flutter (lenguaje Dart)                                                    | Interfaz móvil del repartidor.                                         |
| **Conexión con la API**   | Paquete http o dio de Flutter                                              | Enviar y recibir datos del backend.                                    |
| **Sesión en el teléfono** | Paquete flutter_secure_storage                                             | Guardar el token de sesión de forma segura.                            |
| **Backend**               | Node.js con Express (patrón MVC)                                           | API REST sencilla que las dos interfaces consumen.                     |
| **Seguridad**             | bcrypt (contraseñas) y JWT (sesión)                                        | Cifrado de contraseñas y control de roles.                             |
| **Base de datos**         | MySQL                                                                      | Base de datos relacional para pedidos, stock y pagos.                  |
| **Modelo de IA**          | API de Claude, modelo Claude Haiku 5.5                                     | Bajo costo por token.                                                  |
| **Reportes en PDF**       | Generación de PDF en el backend o paquetes de PDF de Flutter (por definir) | Notas de entrega y reportes.                                           |
| **Control de versiones**  | Git y GitHub                                                               | Historial y respaldo del código, con un repositorio por parte.         |
| **Diseño y modelado**     | Figma, draw.io y MySQL Workbench                                           | Prototipos, diagramas y modelo de datos.                               |
| **Pruebas de API**        | Postman                                                                    | Probar los endpoints.                                                  |
| **Editor**                | Visual Studio Code o Android Studio                                        | Desarrollo y emulador de Android.                                      |

*La app móvil se probará en un emulador de Android y en un teléfono real; el panel web, en Chrome, Edge y Firefox.*

# 13. Criterios de aceptación

| **ID**    | **Criterio de aceptación**                                                                                         | **Método de comprobación**                  |
|-----------|--------------------------------------------------------------------------------------------------------------------|---------------------------------------------|
| **CA-01** | Un usuario con credenciales correctas entra y ve su pantalla según su rol. Con credenciales incorrectas no entra.  | Prueba funcional del login.                 |
| **CA-02** | Un repartidor no puede acceder a funciones de administrador.                                                       | Prueba de permisos.                         |
| **CA-03** | Un pedido con stock insuficiente se rechaza e indica el stock disponible.                                          | Prueba funcional.                           |
| **CA-04** | Un pedido a crédito que supera el límite se rechaza.                                                               | Prueba funcional.                           |
| **CA-05** | Al despachar un pedido, el stock baja la cantidad exacta del pedido.                                               | Comparar stock antes y después.             |
| **CA-06** | Al confirmar una entrega, el estado cambia a entregado y queda registro.                                           | Revisar el historial de estados.            |
| **CA-07** | Un abono reduce el saldo y un abono mayor al saldo se rechaza.                                                     | Prueba funcional.                           |
| **CA-08** | Los reportes muestran datos que coinciden con los registrados.                                                     | Comparar con datos de prueba conocidos.     |
| **CA-09** | Una solicitud a agentes incompleta no inicia y muestra qué falta.                                                  | Prueba con campos vacíos.                   |
| **CA-10** | El validador informa criterios cumplidos e incumplidos y no deja pasar una propuesta con stock o crédito inválido. | Prueba con propuesta correcta y defectuosa. |
| **CA-11** | Un fallo de la API de IA se registra y no se muestra como éxito.                                                   | Prueba simulando un error.                  |
| **CA-12** | Ningún cambio de datos propuesto por un agente se aplica sin la aprobación del administrador.                      | Prueba de control de permisos.              |

# 14. Datos, integraciones y seguridad

## 14.1. Datos principales

Tablas previstas en la base de datos: **usuarios, categorías, productos, movimientos de inventario, lotes, clientes, rutas, asignaciones de ruta, pedidos, detalle de pedido, historial de estados, pagos, solicitudes de agente y resultados de agente**.

## 14.2. Integraciones

La única integración externa es la API del modelo de IA, llamada desde el backend. El sistema deberá manejar fallos de conexión y no exponer la clave de acceso, que se guarda en una variable de entorno y nunca en el código ni en el repositorio.

## 14.3. Seguridad y protección de datos

- Contraseñas cifradas y sesión con token, guardado de forma segura en el teléfono.
- La clave de la API de IA nunca se guarda en la app móvil ni en el panel web: solo en el backend.
- Permisos verificados en el backend para cada petición.
- Mínimo de datos enviados al modelo de IA.
- Datos de prueba anónimos.
- Los textos escritos por usuarios que lleguen al modelo se tratan como datos, no como instrucciones que puedan cambiar las reglas del sistema.

# 15. Pruebas y validación

| **Prueba** | **Escenario**                                             | **Resultado esperado**                      |
|------------|-----------------------------------------------------------|---------------------------------------------|
| **TP-01**  | Login con credenciales correctas e incorrectas.           | Entra solo con credenciales correctas.      |
| **TP-02**  | Un repartidor intenta abrir una función de administrador. | Acceso denegado.                            |
| **TP-03**  | Pedido con cantidad mayor al stock.                       | Se rechaza e indica el stock disponible.    |
| **TP-04**  | Pedido a crédito que supera el límite.                    | Se rechaza.                                 |
| **TP-05**  | Despacho y entrega de un pedido.                          | Stock descontado y estados actualizados.    |
| **TP-06**  | Abono mayor al saldo.                                     | Se rechaza.                                 |
| **TP-07**  | Solicitud a agentes sin objetivo.                         | El sistema pide completar la información.   |
| **TP-08**  | El modelo devuelve una respuesta vacía o con error.       | Se registra el fallo y se informa.          |
| **TP-09**  | La propuesta incumple una regla de negocio.               | El validador la marca y se pide corrección. |
| **TP-10**  | Intento de aplicar una propuesta sin aprobación.          | La acción se bloquea.                       |

El prototipo se acepta cuando las pruebas de prioridad alta se completan satisfactoriamente y el facilitador revisa los resultados.

# 16. Riesgos y mitigaciones

| **Riesgo**                                             | **Mitigación propuesta**                                                                                               |
|--------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| **Respuestas incorrectas o inventadas por la IA**      | El validador revisa con reglas en código y el administrador aprueba antes de aplicar.                                  |
| **Costos de IA mayores a lo esperado**                 | Modelo económico, resúmenes pequeños, límite de reintentos y registro de tokens.                                       |
| **Filtración de datos o claves**                       | Variables de entorno, mínimo de datos enviados y permisos por rol.                                                     |
| **Stock incorrecto por errores de captura**            | Validaciones, historial de movimientos y ajustes con motivo.                                                           |
| **Alcance demasiado grande para el tiempo**            | Construir primero el sistema sin agentes y agregar un solo caso de uso de IA.                                          |
| **Mantener tres proyectos (backend, panel web y app)** | Toda la lógica y las validaciones viven en el backend. El panel web y la app solo muestran datos y envían solicitudes. |
| **Curva de aprendizaje de Flutter y Dart**             | Empezar por login y una lista simple, reutilizar componentes y avanzar módulo por módulo.                              |
| **Falla de la API de IA**                              | Manejo de errores; el sistema sigue funcionando sin los agentes.                                                       |

# 17. Plan de trabajo por fases

| **Fase** | **Actividad**                                                                                                             | **Entregable**                                   |
|----------|---------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| 1        | Cerrar este documento DERCAS y el AGENTES.md.                                                                             | DERCAS y AGENTES.md aprobados                    |
| 2        | Diseñar el modelo de datos y los diagramas de flujo.                                                                      | Modelo en MySQL Workbench y diagramas en draw.io |
| 3        | Prototipar las pantallas principales del panel web y de la app.                                                           | Prototipo en Figma                               |
| 4        | Crear la base de datos y el backend con login, roles, productos y clientes.                                               | API con módulos 1, 2 y 3                         |
| 5        | Desarrollar pedidos, despachos, rutas y cobros.                                                                           | Módulos 4, 5 y 6                                 |
| 6        | Construir el panel web del administrador (productos, tiendas, pedidos, rutas, cobros y reportes) y conectarlo con la API. | AdminWeb funcional y módulo 7                    |
| 7        | Construir la app Flutter del repartidor (login, ruta del día, entrega y cobro) y conectarla con la API.                   | App Flutter funcional                            |
| 8        | Agregar el módulo de agentes con un solo caso de uso (reposición o cobranza).                                             | Módulo 8                                         |
| 9        | Probar con Postman y hacer pruebas de aceptación.                                                                         | Registro de pruebas                              |
| 10       | Documentar y presentar.                                                                                                   | Manual breve e informe final                     |

# 18. Entregables

- Documento DERCAS aprobado.
- Archivo AGENTES.md.
- Diseño de arquitectura, modelo de datos y diagramas de flujo.
- Prototipo de pantallas en Figma.
- Backend (API REST) con los módulos definidos.
- Panel web del administrador (AdminWeb).
- Aplicación móvil del repartidor (Flutter).
- Tres repositorios en GitHub: Backend, Frontend (app móvil) y AdminWeb.
- Registro de pruebas y resultados.
- Manual breve de usuario y configuración.
- Informe de limitaciones, riesgos y mejoras futuras.

# 19. Aprobación del documento

La aprobación de este documento confirma que los requerimientos y criterios de aceptación descritos son la base acordada para el desarrollo inicial. Cualquier cambio de alcance deberá registrarse y revisarse.

| **Responsable**                 | **Nombre**                         | **Firma** | **Fecha** |
|---------------------------------|------------------------------------|-----------|-----------|
| **Autor / responsable técnico** | Anthony Jossue Soledispa Soledispa |           |           |
| **Revisor / docente**           | Ing. Alfonso Tomas Loor            |           |           |

# 20. Glosario y referencias

| **Término**                | **Definición**                                                                                                 |
|----------------------------|----------------------------------------------------------------------------------------------------------------|
| **DERCAS**                 | Documento de Especificaciones, Requerimientos y Criterios de Aceptación de Software.                           |
| **Flutter**                | Herramienta de Google para crear aplicaciones móviles con el lenguaje Dart.                                    |
| **AdminWeb**               | Panel web de administración que el administrador usa desde el navegador.                                       |
| **API REST**               | Conjunto de direcciones del backend por las que el panel web y la app móvil piden o guardan datos.             |
| **MVC**                    | Patrón que separa el Modelo (datos), la Vista (interfaz) y el Controlador (lógica).                            |
| **JWT**                    | Token que identifica al usuario después de iniciar sesión.                                                     |
| **Agente de IA**           | Componente que usa un modelo de IA, o código, para ejecutar una tarea delimitada.                              |
| **Token**                  | Unidad en que se mide el texto que entra y sale de un modelo de IA; el costo depende de la cantidad de tokens. |
| **Stock**                  | Cantidad de producto disponible en bodega.                                                                     |
| **Criterio de aceptación** | Condición verificable que debe cumplirse para aceptar una función.                                             |

**Referencias:**

- National Institute of Standards and Technology (NIST). (2023). Artificial Intelligence Risk Management Framework (AI RMF 1.0). https://doi.org/10.6028/NIST.AI.100-1
- LangChain. (s. f.). LangGraph documentation. https://docs.langchain.com/oss/python/langgraph/overview
- UNESCO. (2023). Guidance for generative AI in education and research. https://unesdoc.unesco.org/ark:/48223/pf0000386693
- Anthropic. (s. f.). Pricing. Claude Platform Docs. https://platform.claude.com/docs/en/about-claude/pricing
