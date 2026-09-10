// ============================================================
// app.js - Servidor web del Sistema Experto de Prestamos
// ============================================================
const express = require('express');
const path = require('path');
const { db, cargarBaseConocimiento } = require('./db');
const { validarSolicitud } = require('./validaciones');
const { evaluarSolicitud } = require('./motorInferencia');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --------------------------------------------------------------
// POST /api/solicitudes
// Recibe los datos del formulario, valida, corre el motor de
// inferencia y persiste solicitante + solicitud + explicacion.
// --------------------------------------------------------------
app.post('/api/solicitudes', (req, res) => {
  const validacion = validarSolicitud(req.body);
  if (!validacion.valido) {
    return res.status(400).json({ ok: false, errores: validacion.errores });
  }

  const datos = validacion.datos;
  const baseConocimiento = cargarBaseConocimiento();
  const resultado = evaluarSolicitud(datos, baseConocimiento);

  const insertarSolicitante = db.prepare(`
    INSERT INTO solicitantes
      (nombre, correo, telefono, domicilio, edad, estado_civil, dependientes_economicos,
       ingreso_mensual, tipo_empleo, tipo_ingreso, antiguedad_laboral_meses,
       puntaje_crediticio, historial_pagos, deudas_mensuales)
    VALUES (@nombre, @correo, @telefono, @domicilio, @edad, @estado_civil, @dependientes_economicos,
            @ingreso_mensual, @tipo_empleo, @tipo_ingreso, @antiguedad_laboral_meses,
            @puntaje_crediticio, @historial_pagos, @deudas_mensuales)
  `);
  const infoSolicitante = insertarSolicitante.run({
    ...datos,
    puntaje_crediticio: resultado.hechos.puntaje_crediticio
  });
  const solicitanteId = infoSolicitante.lastInsertRowid;

  const insertarSolicitud = db.prepare(`
    INSERT INTO solicitudes
      (solicitante_id, monto_solicitado, plazo_meses, cuota_estimada, rdi,
       puntaje_total, nivel_riesgo, decision, certeza)
    VALUES (@solicitante_id, @monto_solicitado, @plazo_meses, @cuota_estimada, @rdi,
            @puntaje_total, @nivel_riesgo, @decision, @certeza)
  `);
  const infoSolicitud = insertarSolicitud.run({
    solicitante_id: solicitanteId,
    monto_solicitado: datos.monto_solicitado,
    plazo_meses: datos.plazo_meses,
    cuota_estimada: resultado.hechos.cuota_estimada,
    rdi: resultado.hechos.rdi,
    puntaje_total: resultado.puntajeTotal,
    nivel_riesgo: resultado.nivelRiesgo,
    decision: resultado.decision,
    certeza: resultado.certeza
  });
  const solicitudId = infoSolicitud.lastInsertRowid;

  const insertarExplicacion = db.prepare(`
    INSERT INTO solicitud_reglas_aplicadas
      (solicitud_id, tipo_regla, regla_id, descripcion, puntos, orden)
    VALUES (@solicitud_id, @tipo_regla, @regla_id, @descripcion, @puntos, @orden)
  `);
  resultado.explicacion.forEach((paso, i) => {
    insertarExplicacion.run({
      solicitud_id: solicitudId,
      tipo_regla: paso.tipo,
      regla_id: paso.reglaId ?? null,
      descripcion: paso.descripcion,
      puntos: paso.puntos ?? null,
      orden: i
    });
  });

  res.json({
    ok: true,
    solicitudId,
    nombre: datos.nombre,
    cuotaEstimada: resultado.hechos.cuota_estimada,
    rdi: resultado.hechos.rdi,
    puntajeCreditoEstimado: resultado.hechos.puntaje_crediticio,
    puntajeTotal: resultado.puntajeTotal,
    nivelRiesgo: resultado.nivelRiesgo,
    decision: resultado.decision,
    certeza: resultado.certeza,
    explicacion: resultado.explicacion
  });
});

// --------------------------------------------------------------
// GET /api/solicitudes/:id  -> recuperar una evaluacion ya guardada
// --------------------------------------------------------------
app.get('/api/solicitudes/:id', (req, res) => {
  const solicitud = db.prepare(`
    SELECT s.*, so.nombre, so.puntaje_crediticio
    FROM solicitudes s
    JOIN solicitantes so ON so.id = s.solicitante_id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!solicitud) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });

  const explicacion = db.prepare(`
    SELECT tipo_regla AS tipo, regla_id AS reglaId, descripcion, puntos
    FROM solicitud_reglas_aplicadas
    WHERE solicitud_id = ?
    ORDER BY orden ASC
  `).all(req.params.id);

  res.json({
    ok: true,
    solicitudId: solicitud.id,
    nombre: solicitud.nombre,
    cuotaEstimada: solicitud.cuota_estimada,
    rdi: solicitud.rdi,
    puntajeCreditoEstimado: solicitud.puntaje_crediticio,
    puntajeTotal: solicitud.puntaje_total,
    nivelRiesgo: solicitud.nivel_riesgo,
    decision: solicitud.decision,
    certeza: solicitud.certeza,
    explicacion
  });
});

// --------------------------------------------------------------
// GET /api/reglas -> expone la base de conocimiento (transparencia)
// --------------------------------------------------------------
app.get('/api/reglas', (req, res) => {
  res.json(cargarBaseConocimiento());
});

// --------------------------------------------------------------
// GET /api/solicitudes -> historial simple (para revision docente)
// --------------------------------------------------------------
app.get('/api/solicitudes', (req, res) => {
  const filas = db.prepare(`
    SELECT s.id, so.nombre, s.puntaje_total, s.nivel_riesgo, s.decision, s.certeza, s.creado_en
    FROM solicitudes s
    JOIN solicitantes so ON so.id = s.solicitante_id
    ORDER BY s.id DESC
    LIMIT 50
  `).all();
  res.json({ ok: true, solicitudes: filas });
});

app.listen(PORT, () => {
  console.log(`Sistema Experto de Prestamos escuchando en http://localhost:${PORT}`);
});
