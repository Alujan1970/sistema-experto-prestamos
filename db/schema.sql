-- ============================================================
-- Esquema de base de datos - Sistema Experto de Prestamos
-- ============================================================

-- Personas que solicitan un prestamo (los "hechos" que entran al sistema)
-- Nota: puntaje_crediticio ya NO se captura en el formulario; el motor lo
-- estima a partir de otras variables (ver reglas_puntaje_credito) y se
-- guarda aqui como resultado de esa inferencia.
CREATE TABLE IF NOT EXISTS solicitantes (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre                  TEXT NOT NULL,
    -- datos de contacto (identificacion, no afectan el riesgo)
    correo                  TEXT NOT NULL,
    telefono                TEXT NOT NULL,
    domicilio               TEXT NOT NULL,
    -- datos generales
    edad                    INTEGER NOT NULL,
    estado_civil            TEXT NOT NULL CHECK (estado_civil IN ('soltero','casado','union_libre','divorciado','viudo')),
    dependientes_economicos INTEGER NOT NULL DEFAULT 0,
    -- situacion laboral y financiera
    ingreso_mensual         REAL NOT NULL,
    tipo_empleo             TEXT NOT NULL CHECK (tipo_empleo IN ('asalariado','independiente','desempleado')),
    tipo_ingreso            TEXT NOT NULL CHECK (tipo_ingreso IN ('fijo','variable')),
    antiguedad_laboral_meses INTEGER NOT NULL,
    historial_pagos         TEXT NOT NULL CHECK (historial_pagos IN ('excelente','bueno','regular','malo')),
    deudas_mensuales        REAL NOT NULL DEFAULT 0,
    puntaje_crediticio      INTEGER NOT NULL,   -- estimado por el motor, no capturado
    creado_en               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cada evaluacion (corrida del motor de inferencia) sobre un solicitante
CREATE TABLE IF NOT EXISTS solicitudes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitante_id      INTEGER NOT NULL REFERENCES solicitantes(id),
    monto_solicitado    REAL NOT NULL,
    plazo_meses         INTEGER NOT NULL,
    cuota_estimada      REAL NOT NULL,
    rdi                 REAL NOT NULL,          -- relacion deuda/ingreso (%)
    puntaje_total       INTEGER,                -- NULL si fue rechazo automatico
    nivel_riesgo        TEXT NOT NULL CHECK (nivel_riesgo IN ('bajo','medio','alto')),
    decision            TEXT NOT NULL CHECK (decision IN ('aprobado','aprobado_con_condiciones','rechazado')),
    certeza             REAL NOT NULL,          -- factor de certeza de la decision (0-1)
    creado_en           TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (solicitante_id) REFERENCES solicitantes(id)
);

-- Bitacora de que reglas se dispararon en cada solicitud (modulo de explicacion)
CREATE TABLE IF NOT EXISTS solicitud_reglas_aplicadas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitud_id    INTEGER NOT NULL REFERENCES solicitudes(id),
    tipo_regla      TEXT NOT NULL CHECK (tipo_regla IN ('exclusion','puntaje','puntaje_credito')),
    regla_id        INTEGER,
    descripcion     TEXT NOT NULL,
    puntos          INTEGER,                    -- NULL para reglas de exclusion
    orden           INTEGER NOT NULL
);

-- ============================================================
-- BASE DE CONOCIMIENTO (knowledge base)
-- Estas tablas son el "conocimiento" del experto humano,
-- separado del motor que lo interpreta (server/motorInferencia.js)
-- ============================================================

-- Reglas de exclusion: si se cumplen, hay rechazo automatico (sin importar el resto)
CREATE TABLE IF NOT EXISTS reglas_exclusion (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    variable    TEXT NOT NULL,      -- campo del hecho que se evalua
    operador    TEXT NOT NULL,      -- '<', '<=', '>', '>=', '=='
    valor       REAL NOT NULL,
    mensaje     TEXT NOT NULL,      -- explicacion legible de la regla
    activa      INTEGER NOT NULL DEFAULT 1
);

-- Reglas de puntaje: ponderan cada variable dentro de un rango y asignan puntos
CREATE TABLE IF NOT EXISTS reglas_puntaje (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    variable    TEXT NOT NULL,      -- p.ej. 'puntaje_crediticio'
    min         REAL,               -- NULL = sin limite inferior
    max         REAL,               -- NULL = sin limite superior
    puntos      INTEGER NOT NULL,
    descripcion TEXT NOT NULL
);

-- Reglas para ESTIMAR el puntaje crediticio (sustituye al buro de credito,
-- que en la vida real es una fuente externa que aqui no tenemos disponible).
-- Convierte comportamiento observable (historial de pagos, estabilidad
-- laboral, tipo de ingreso, endeudamiento previo a este prestamo) en un
-- puntaje sintetico de 300 a 850, igual de rango que un buro real.
CREATE TABLE IF NOT EXISTS reglas_puntaje_credito (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    variable    TEXT NOT NULL,
    min         REAL,
    max         REAL,
    puntos      INTEGER NOT NULL,   -- puntos internos 0-100, se reescalan a 300-850
    descripcion TEXT NOT NULL
);

-- Reglas de riesgo: convierten el puntaje total (0-100) en nivel de riesgo + decision
CREATE TABLE IF NOT EXISTS reglas_riesgo (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    min         INTEGER NOT NULL,
    max         INTEGER NOT NULL,
    nivel_riesgo TEXT NOT NULL,
    decision    TEXT NOT NULL,
    descripcion TEXT NOT NULL
);
