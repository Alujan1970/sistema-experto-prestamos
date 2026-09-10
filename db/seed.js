// ============================================================
// seed.js
// Crea la base de datos (si no existe) y carga la BASE DE CONOCIMIENTO:
// las reglas de exclusion, las reglas de puntaje y las reglas de riesgo.
//
// Este archivo representa la "adquisicion del conocimiento": aqui es
// donde el ingeniero de conocimiento (nosotros) transcribe las politicas
// de un analista de credito humano en forma de reglas SI-ENTONCES.
// ============================================================
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'sistema_experto.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 1) Crear esquema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// 2) Limpiar tablas de conocimiento para poder re-sembrar sin duplicar
db.exec(`
  DELETE FROM reglas_exclusion;
  DELETE FROM reglas_puntaje;
  DELETE FROM reglas_puntaje_credito;
  DELETE FROM reglas_riesgo;
`);

// ------------------------------------------------------------
// REGLAS DE EXCLUSION (rechazo automatico, sin excepcion)
// Se evaluan sobre "hechos derivados" que calcula el motor
// (ver server/motorInferencia.js -> calcularHechosDerivados)
// ------------------------------------------------------------
const insertExclusion = db.prepare(`
  INSERT INTO reglas_exclusion (variable, operador, valor, mensaje, activa)
  VALUES (@variable, @operador, @valor, @mensaje, 1)
`);

const reglasExclusion = [
  {
    variable: 'edad',
    operador: '<',
    valor: 18,
    mensaje: 'El solicitante es menor de edad; legalmente no puede contraer un credito por si mismo.'
  },
  {
    variable: 'edad',
    operador: '>',
    valor: 70,
    mensaje: 'La edad supera el limite de aceptacion de riesgo de la institucion (70 anios).'
  },
  {
    variable: 'puntaje_crediticio',
    operador: '<',
    valor: 500,
    mensaje: 'El buro de credito reporta un puntaje por debajo del minimo aceptable (500).'
  },
  {
    variable: 'desempleado',
    operador: '==',
    valor: 1,
    mensaje: 'El solicitante no cuenta con una fuente de ingreso comprobable (desempleado).'
  },
  {
    variable: 'rdi',
    operador: '>',
    valor: 60,
    mensaje: 'La relacion deuda/ingreso (RDI) supera el 60%: el solicitante ya esta sobre-endeudado.'
  }
];
reglasExclusion.forEach(r => insertExclusion.run(r));

// ------------------------------------------------------------
// REGLAS PARA ESTIMAR EL PUNTAJE CREDITICIO (sustituye al buro externo)
// Variables ya normalizadas a numero por el motor:
//   historial_pagos_cod    (peso 40) -> excelente=4, bueno=3, regular=2, malo=1
//   endeudamiento_previo   (peso 25) -> deudas_mensuales / ingreso_mensual, en % (antes del nuevo prestamo)
//   estabilidad_efectiva   (peso 20) -> meses de antiguedad ponderados por tipo de empleo
//   tipo_ingreso_cod       (peso 15) -> fijo=1, variable=0
// El total (0-100) se reescala a un puntaje sintetico de 300 a 850.
// ------------------------------------------------------------
const insertPuntajeCredito = db.prepare(`
  INSERT INTO reglas_puntaje_credito (variable, min, max, puntos, descripcion)
  VALUES (@variable, @min, @max, @puntos, @descripcion)
`);

const reglasPuntajeCredito = [
  { variable: 'historial_pagos_cod', min: 4, max: 4, puntos: 40, descripcion: 'Historial de pagos excelente' },
  { variable: 'historial_pagos_cod', min: 3, max: 3, puntos: 28, descripcion: 'Historial de pagos bueno' },
  { variable: 'historial_pagos_cod', min: 2, max: 2, puntos: 14, descripcion: 'Historial de pagos regular' },
  { variable: 'historial_pagos_cod', min: 1, max: 1, puntos: 0,  descripcion: 'Historial de pagos malo' },

  { variable: 'endeudamiento_previo', min: null, max: 15,   puntos: 25, descripcion: 'Endeudamiento previo bajo (<=15% del ingreso)' },
  { variable: 'endeudamiento_previo', min: 15.001, max: 30, puntos: 18, descripcion: 'Endeudamiento previo moderado (15-30%)' },
  { variable: 'endeudamiento_previo', min: 30.001, max: 45, puntos: 8,  descripcion: 'Endeudamiento previo alto (30-45%)' },
  { variable: 'endeudamiento_previo', min: 45.001, max: null, puntos: 0, descripcion: 'Endeudamiento previo muy alto (>45%)' },

  { variable: 'estabilidad_efectiva', min: 36, max: null, puntos: 20, descripcion: 'Estabilidad laboral alta (36+ meses equivalentes)' },
  { variable: 'estabilidad_efectiva', min: 12, max: 35.999, puntos: 14, descripcion: 'Estabilidad laboral media (12-35 meses equivalentes)' },
  { variable: 'estabilidad_efectiva', min: 6,  max: 11.999, puntos: 7,  descripcion: 'Estabilidad laboral baja (6-11 meses equivalentes)' },
  { variable: 'estabilidad_efectiva', min: 0,  max: 5.999,  puntos: 2,  descripcion: 'Estabilidad laboral muy baja (menos de 6 meses equivalentes)' },

  { variable: 'tipo_ingreso_cod', min: 1, max: 1, puntos: 15, descripcion: 'Ingreso fijo (mas predecible)' },
  { variable: 'tipo_ingreso_cod', min: 0, max: 0, puntos: 5,  descripcion: 'Ingreso variable (menos predecible)' }
];
reglasPuntajeCredito.forEach(r => insertPuntajeCredito.run(r));

// ------------------------------------------------------------
// REGLAS DE PUNTAJE (conocimiento heuristico ponderado, 0-100 pts)
// Variables ya normalizadas a numero por el motor:
//   puntaje_crediticio   (peso 35)
//   estabilidad_efectiva (peso 20)  -> meses de antiguedad ponderados por tipo de empleo
//   historial_pagos_cod  (peso 10)  -> excelente=4, bueno=3, regular=2, malo=1
//   rdi                  (peso 25)  -> relacion deuda/ingreso, en %
//   edad                 (peso 10)
// ------------------------------------------------------------
const insertPuntaje = db.prepare(`
  INSERT INTO reglas_puntaje (variable, min, max, puntos, descripcion)
  VALUES (@variable, @min, @max, @puntos, @descripcion)
`);

const reglasPuntaje = [
  // --- puntaje_crediticio (peso 35) ---
  { variable: 'puntaje_crediticio', min: 750, max: null, puntos: 35, descripcion: 'Historial crediticio excelente (>=750)' },
  { variable: 'puntaje_crediticio', min: 650, max: 749, puntos: 25, descripcion: 'Historial crediticio bueno (650-749)' },
  { variable: 'puntaje_crediticio', min: 550, max: 649, puntos: 15, descripcion: 'Historial crediticio aceptable (550-649)' },
  { variable: 'puntaje_crediticio', min: 500, max: 549, puntos: 5,  descripcion: 'Historial crediticio bajo (500-549)' },

  // --- estabilidad_efectiva: meses de antiguedad ponderados por tipo de empleo (peso 20) ---
  { variable: 'estabilidad_efectiva', min: 24, max: null, puntos: 20, descripcion: 'Estabilidad laboral alta (equivalente a 24+ meses como asalariado)' },
  { variable: 'estabilidad_efectiva', min: 12, max: 23.999, puntos: 14, descripcion: 'Estabilidad laboral media (12-23 meses equivalentes)' },
  { variable: 'estabilidad_efectiva', min: 6,  max: 11.999, puntos: 8,  descripcion: 'Estabilidad laboral baja (6-11 meses equivalentes)' },
  { variable: 'estabilidad_efectiva', min: 0,  max: 5.999,  puntos: 2,  descripcion: 'Estabilidad laboral muy baja (menos de 6 meses equivalentes)' },

  // --- historial_pagos_cod (peso 10): excelente=4, bueno=3, regular=2, malo=1 ---
  { variable: 'historial_pagos_cod', min: 4, max: 4, puntos: 10, descripcion: 'Historial de pagos excelente' },
  { variable: 'historial_pagos_cod', min: 3, max: 3, puntos: 7,  descripcion: 'Historial de pagos bueno' },
  { variable: 'historial_pagos_cod', min: 2, max: 2, puntos: 3,  descripcion: 'Historial de pagos regular' },
  { variable: 'historial_pagos_cod', min: 1, max: 1, puntos: 0,  descripcion: 'Historial de pagos malo' },

  // --- rdi: relacion deuda/ingreso en % (peso 25, menor es mejor) ---
  { variable: 'rdi', min: null, max: 30,     puntos: 25, descripcion: 'Endeudamiento bajo (RDI <= 30%)' },
  { variable: 'rdi', min: 30.001, max: 40,   puntos: 15, descripcion: 'Endeudamiento moderado (RDI 30-40%)' },
  { variable: 'rdi', min: 40.001, max: 50,   puntos: 5,  descripcion: 'Endeudamiento alto (RDI 40-50%)' },
  { variable: 'rdi', min: 50.001, max: 60,   puntos: 0,  descripcion: 'Endeudamiento muy alto (RDI 50-60%)' },

  // --- edad (peso 10) ---
  { variable: 'edad', min: 25, max: 55, puntos: 10, descripcion: 'Rango de edad de menor riesgo (25-55 anios)' },
  { variable: 'edad', min: 18, max: 24.999, puntos: 6, descripcion: 'Adulto joven (18-24 anios)' },
  { variable: 'edad', min: 56, max: 65.999, puntos: 6, descripcion: 'Adulto mayor pre-jubilacion (56-65 anios)' },
  { variable: 'edad', min: 66, max: 70,   puntos: 2, descripcion: 'Cercano al limite de edad aceptado (66-70 anios)' }
];
reglasPuntaje.forEach(r => insertPuntaje.run(r));

// ------------------------------------------------------------
// REGLAS DE RIESGO (traducen el puntaje total 0-100 a nivel + decision)
// ------------------------------------------------------------
const insertRiesgo = db.prepare(`
  INSERT INTO reglas_riesgo (min, max, nivel_riesgo, decision, descripcion)
  VALUES (@min, @max, @nivel_riesgo, @decision, @descripcion)
`);

const reglasRiesgo = [
  { min: 75, max: 100, nivel_riesgo: 'bajo',  decision: 'aprobado',               descripcion: 'Perfil solido: se aprueba en condiciones estandar.' },
  { min: 50, max: 74,  nivel_riesgo: 'medio', decision: 'aprobado_con_condiciones', descripcion: 'Perfil aceptable con reservas: se aprueba con garantia, aval o tasa ajustada.' },
  { min: 0,  max: 49,  nivel_riesgo: 'alto',  decision: 'rechazado',              descripcion: 'Perfil de alto riesgo: se rechaza la solicitud.' }
];
reglasRiesgo.forEach(r => insertRiesgo.run(r));

console.log('Base de conocimiento cargada correctamente en', DB_PATH);
console.log(' -', db.prepare('SELECT COUNT(*) c FROM reglas_exclusion').get().c, 'reglas de exclusion');
console.log(' -', db.prepare('SELECT COUNT(*) c FROM reglas_puntaje_credito').get().c, 'reglas de estimacion de puntaje crediticio');
console.log(' -', db.prepare('SELECT COUNT(*) c FROM reglas_puntaje').get().c, 'reglas de puntaje');
console.log(' -', db.prepare('SELECT COUNT(*) c FROM reglas_riesgo').get().c, 'reglas de riesgo');

db.close();
