# Sistema Experto — Evaluación de Préstamos Bancarios

Sistema experto basado en reglas para determinar si una persona aplica a un
préstamo bancario. Incluye base de conocimiento en base de datos (SQLite),
motor de inferencia con encadenamiento hacia adelante, factor de certeza
(manejo de incertidumbre), validaciones y una interfaz web.

El puntaje crediticio **no se captura en el formulario**: el propio motor lo
estima (300-850) a partir del historial de pagos, la estabilidad laboral, el
tipo de ingreso (fijo/variable) y el endeudamiento previo del solicitante,
en sustitución de una consulta a un buró de crédito real.

Ver el documento `Sistema_Experto_Prestamos_Bancarios.docx` (entregado junto
con este código) para la explicación completa, paso a paso, de cómo funciona
y cómo se construyó. Nota: ese documento describe la primera versión del
formulario (con el puntaje crediticio como dato manual); el código ya
incorpora la versión actualizada descrita en este README.

## Requisitos

- Node.js 18 o superior

## Instalación y ejecución

```bash
npm install          # instala Express y better-sqlite3
npm run seed         # crea la base de datos y carga la base de conocimiento
npm start            # inicia el servidor
```

Abrir http://localhost:3000 en el navegador.

Para reiniciar la base de conocimiento a su estado original (por ejemplo,
después de editar `db/seed.js` para cambiar una política), basta con borrar
`db/sistema_experto.db` y volver a ejecutar `npm start`: el sistema la
recrea automáticamente.

## Estructura del proyecto

```
db/
  schema.sql            Esquema de la base de datos
  seed.js               Carga la base de conocimiento (reglas)
server/
  app.js                Servidor Express y endpoints de la API
  db.js                 Conexión a la base de datos
  motorInferencia.js    Motor de inferencia (encadenamiento hacia adelante)
  validaciones.js       Validación de los datos de entrada
public/
  index.html            Formulario e interfaz de resultados
  estilos.css
  app.js                Lógica del frontend
capturas/                Capturas de pantalla y diagrama de arquitectura
```

## Endpoints principales

- `POST /api/solicitudes` — evalúa una nueva solicitud
- `GET /api/solicitudes/:id` — consulta una evaluación guardada
- `GET /api/solicitudes` — historial de las últimas evaluaciones
- `GET /api/reglas` — expone la base de conocimiento completa

## Autor

Arturo Luján López — Sistemas Basados en Conocimiento, ISC, Universidad del Sur.
