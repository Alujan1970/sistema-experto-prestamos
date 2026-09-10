// ============================================================
// validaciones.js
// Validacion de datos de ENTRADA (independiente de las reglas de negocio
// del motor de inferencia). Esto corresponde al modulo de "adquisicion
// de hechos": antes de razonar sobre un hecho, hay que asegurarse de que
// el hecho es valido/coherente.
// ============================================================

const TIPOS_EMPLEO = ['asalariado', 'independiente', 'desempleado'];
const TIPOS_INGRESO = ['fijo', 'variable'];
const HISTORIALES = ['excelente', 'bueno', 'regular', 'malo'];
const ESTADOS_CIVILES = ['soltero', 'casado', 'union_libre', 'divorciado', 'viudo'];
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONO = /^[0-9()+\-\s]{7,15}$/;

function validarSolicitud(body) {
  const errores = [];
  const num = (v) => (v === '' || v === null || v === undefined) ? NaN : Number(v);

  const nombre = (body.nombre || '').trim();
  if (!nombre) errores.push('El nombre es obligatorio.');

  // --- datos de contacto (identificacion, no afectan el riesgo) ---
  const correo = (body.correo || '').trim();
  if (!REGEX_CORREO.test(correo)) errores.push('El correo electronico no es valido.');

  const telefono = (body.telefono || '').trim();
  if (!REGEX_TELEFONO.test(telefono)) errores.push('El telefono debe tener entre 7 y 15 digitos.');

  const domicilio = (body.domicilio || '').trim();
  if (!domicilio) errores.push('El domicilio es obligatorio.');

  // --- datos generales ---
  const edad = num(body.edad);
  if (!Number.isFinite(edad) || edad <= 0 || edad > 120) errores.push('La edad debe ser un numero entre 1 y 120.');

  const estado_civil = body.estado_civil;
  if (!ESTADOS_CIVILES.includes(estado_civil)) errores.push(`El estado civil debe ser uno de: ${ESTADOS_CIVILES.join(', ')}.`);

  const dependientes_economicos = num(body.dependientes_economicos ?? 0);
  if (!Number.isFinite(dependientes_economicos) || dependientes_economicos < 0) errores.push('Los dependientes economicos deben ser un numero mayor o igual a 0.');

  // --- situacion laboral y financiera ---
  const ingreso_mensual = num(body.ingreso_mensual);
  if (!Number.isFinite(ingreso_mensual) || ingreso_mensual <= 0) errores.push('El ingreso mensual debe ser un numero mayor a 0.');

  const tipo_empleo = body.tipo_empleo;
  if (!TIPOS_EMPLEO.includes(tipo_empleo)) errores.push(`El tipo de empleo debe ser uno de: ${TIPOS_EMPLEO.join(', ')}.`);

  const tipo_ingreso = body.tipo_ingreso;
  if (!TIPOS_INGRESO.includes(tipo_ingreso)) errores.push(`El tipo de ingreso debe ser uno de: ${TIPOS_INGRESO.join(', ')}.`);

  const antiguedad_laboral_meses = num(body.antiguedad_laboral_meses);
  if (!Number.isFinite(antiguedad_laboral_meses) || antiguedad_laboral_meses < 0) errores.push('La antiguedad laboral (meses) debe ser un numero mayor o igual a 0.');

  const historial_pagos = body.historial_pagos;
  if (!HISTORIALES.includes(historial_pagos)) errores.push(`El historial de pagos debe ser uno de: ${HISTORIALES.join(', ')}.`);

  const deudas_mensuales = num(body.deudas_mensuales ?? 0);
  if (!Number.isFinite(deudas_mensuales) || deudas_mensuales < 0) errores.push('Las deudas mensuales deben ser un numero mayor o igual a 0.');

  // --- datos del prestamo ---
  const monto_solicitado = num(body.monto_solicitado);
  if (!Number.isFinite(monto_solicitado) || monto_solicitado <= 0) errores.push('El monto solicitado debe ser un numero mayor a 0.');

  const plazo_meses = num(body.plazo_meses);
  if (!Number.isFinite(plazo_meses) || plazo_meses < 3 || plazo_meses > 120) errores.push('El plazo debe estar entre 3 y 120 meses.');

  if (errores.length > 0) {
    return { valido: false, errores };
  }

  return {
    valido: true,
    datos: {
      nombre, correo, telefono, domicilio,
      edad, estado_civil, dependientes_economicos,
      ingreso_mensual, tipo_empleo, tipo_ingreso, antiguedad_laboral_meses,
      historial_pagos, deudas_mensuales,
      monto_solicitado, plazo_meses
    }
  };
}

module.exports = { validarSolicitud, TIPOS_EMPLEO, TIPOS_INGRESO, HISTORIALES, ESTADOS_CIVILES };
