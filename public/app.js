// Frontend: validaciones basicas en cliente + consumo de la API.
const form = document.getElementById('formSolicitud');
const cajaErrores = document.getElementById('cajaErrores');
const panelFormulario = document.getElementById('panelFormulario');
const panelResultado = document.getElementById('panelResultado');
const panelReglas = document.getElementById('panelReglas');
const panelHistorial = document.getElementById('panelHistorial');

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONO = /^[0-9()+\-\s]{7,15}$/;

function mostrarErrores(lista) {
  cajaErrores.hidden = lista.length === 0;
  cajaErrores.innerHTML = lista.map(e => `&bull; ${e}`).join('<br>');
}

function validarEnCliente(datos) {
  const errores = [];
  if (!datos.nombre.trim()) errores.push('El nombre es obligatorio.');
  if (!REGEX_CORREO.test(datos.correo)) errores.push('El correo electronico no es valido.');
  if (!REGEX_TELEFONO.test(datos.telefono)) errores.push('El telefono debe tener entre 7 y 15 digitos.');
  if (!datos.domicilio.trim()) errores.push('El domicilio es obligatorio.');
  if (!(datos.edad > 0 && datos.edad <= 120)) errores.push('La edad debe estar entre 1 y 120.');
  if (!datos.estado_civil) errores.push('Selecciona un estado civil.');
  if (!(datos.dependientes_economicos >= 0)) errores.push('Los dependientes economicos no pueden ser negativos.');
  if (!datos.tipo_empleo) errores.push('Selecciona un tipo de empleo.');
  if (!datos.tipo_ingreso) errores.push('Selecciona un tipo de ingreso.');
  if (!(datos.antiguedad_laboral_meses >= 0)) errores.push('La antiguedad laboral no puede ser negativa.');
  if (!(datos.ingreso_mensual > 0)) errores.push('El ingreso mensual debe ser mayor a 0.');
  if (!datos.historial_pagos) errores.push('Selecciona un historial de pagos.');
  if (!(datos.monto_solicitado > 0)) errores.push('El monto solicitado debe ser mayor a 0.');
  if (!(datos.plazo_meses >= 3 && datos.plazo_meses <= 120)) errores.push('El plazo debe estar entre 3 y 120 meses.');
  return errores;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const fd = new FormData(form);
  const datos = {
    nombre: fd.get('nombre'),
    correo: fd.get('correo'),
    telefono: fd.get('telefono'),
    domicilio: fd.get('domicilio'),
    edad: Number(fd.get('edad')),
    estado_civil: fd.get('estado_civil'),
    dependientes_economicos: Number(fd.get('dependientes_economicos') || 0),
    ingreso_mensual: Number(fd.get('ingreso_mensual')),
    tipo_empleo: fd.get('tipo_empleo'),
    tipo_ingreso: fd.get('tipo_ingreso'),
    antiguedad_laboral_meses: Number(fd.get('antiguedad_laboral_meses')),
    historial_pagos: fd.get('historial_pagos'),
    deudas_mensuales: Number(fd.get('deudas_mensuales') || 0),
    monto_solicitado: Number(fd.get('monto_solicitado')),
    plazo_meses: Number(fd.get('plazo_meses'))
  };

  const erroresCliente = validarEnCliente(datos);
  if (erroresCliente.length > 0) {
    mostrarErrores(erroresCliente);
    return;
  }
  mostrarErrores([]);

  try {
    const resp = await fetch('/api/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      mostrarErrores(data.errores || ['Ocurrio un error al evaluar la solicitud.']);
      return;
    }

    mostrarResultado(data);
  } catch (err) {
    mostrarErrores(['No se pudo conectar con el servidor: ' + err.message]);
  }
});

function etiquetaDecision(decision) {
  return {
    aprobado: 'Aprobado',
    aprobado_con_condiciones: 'Aprobado con condiciones',
    rechazado: 'Rechazado'
  }[decision] || decision;
}

function mostrarResultado(data) {
  panelFormulario.classList.add('oculto');
  panelReglas.classList.add('oculto');
  panelHistorial.classList.add('oculto');
  panelResultado.classList.remove('oculto');

  const claseRiesgo = { bajo: 'riesgo-bajo', medio: 'riesgo-medio', alto: 'riesgo-alto' }[data.nivelRiesgo];

  document.getElementById('tarjetaResultado').innerHTML = `
    <div class="tarjeta-decision ${claseRiesgo}">
      <p class="decision-titulo">${etiquetaDecision(data.decision)}</p>
      <p class="decision-sub">Solicitante: ${data.nombre} &middot; Nivel de riesgo: ${data.nivelRiesgo.toUpperCase()} &middot; Certeza de la decision: ${(data.certeza * 100).toFixed(0)}%</p>
    </div>
    <div class="metricas">
      <div class="metrica"><div class="valor">${data.puntajeCreditoEstimado}</div><div class="etiqueta">Puntaje crediticio estimado</div></div>
      <div class="metrica"><div class="valor">${data.puntajeTotal ?? '—'}</div><div class="etiqueta">Puntaje de riesgo (0-100)</div></div>
      <div class="metrica"><div class="valor">${data.rdi.toFixed(1)}%</div><div class="etiqueta">Relacion deuda/ingreso</div></div>
      <div class="metrica"><div class="valor">$${Number(data.cuotaEstimada).toLocaleString('es-MX', {maximumFractionDigits:2})}</div><div class="etiqueta">Cuota mensual estimada</div></div>
      <div class="metrica"><div class="valor">#${data.solicitudId}</div><div class="etiqueta">Folio de solicitud</div></div>
    </div>
  `;

  const pasoHtml = (paso) => `
    <li class="${paso.tipo}">
      ${paso.descripcion}
      ${paso.puntos !== null && paso.puntos !== undefined ? `<span class="puntos-badge">+${paso.puntos} pts</span>` : ''}
    </li>
  `;

  const pasosCredito = data.explicacion.filter(p => p.tipo === 'puntaje_credito');
  const pasosRiesgo = data.explicacion.filter(p => p.tipo === 'puntaje' || p.tipo === 'exclusion');

  const lista = document.getElementById('listaExplicacion');
  lista.innerHTML = `
    <p class="subtitulo-explicacion">Paso 1 &middot; Estimacion del puntaje crediticio</p>
    <ol>${pasosCredito.map(pasoHtml).join('')}</ol>
    <p class="subtitulo-explicacion">Paso 2 &middot; Evaluacion de riesgo y decision</p>
    <ol>${pasosRiesgo.map(pasoHtml).join('')}</ol>
  `;
}

document.getElementById('btnNuevaSolicitud').addEventListener('click', () => {
  panelResultado.classList.add('oculto');
  panelFormulario.classList.remove('oculto');
  form.reset();
});

document.getElementById('btnVerReglas').addEventListener('click', async () => {
  const resp = await fetch('/api/reglas');
  const data = await resp.json();

  const filasExclusion = data.reglasExclusion.map(r => `
    <tr><td>${r.variable}</td><td>${r.operador} ${r.valor}</td><td>${r.mensaje}</td></tr>
  `).join('');

  const filasPuntajeCredito = data.reglasPuntajeCredito.map(r => `
    <tr><td>${r.variable}</td><td>${r.min ?? '—'} a ${r.max ?? '—'}</td><td>${r.puntos}</td><td>${r.descripcion}</td></tr>
  `).join('');

  const filasPuntaje = data.reglasPuntaje.map(r => `
    <tr><td>${r.variable}</td><td>${r.min ?? '—'} a ${r.max ?? '—'}</td><td>${r.puntos}</td><td>${r.descripcion}</td></tr>
  `).join('');

  const filasRiesgo = data.reglasRiesgo.map(r => `
    <tr><td>${r.min} a ${r.max}</td><td>${r.nivel_riesgo}</td><td>${r.decision}</td><td>${r.descripcion}</td></tr>
  `).join('');

  document.getElementById('contenidoReglas').innerHTML = `
    <h3>Reglas de exclusion (rechazo automatico)</h3>
    <table class="reglas">
      <tr><th>Variable</th><th>Condicion</th><th>Mensaje</th></tr>
      ${filasExclusion}
    </table>
    <h3>Reglas para estimar el puntaje crediticio (0-100, reescalado a 300-850)</h3>
    <table class="reglas">
      <tr><th>Variable</th><th>Rango</th><th>Puntos</th><th>Descripcion</th></tr>
      ${filasPuntajeCredito}
    </table>
    <h3>Reglas de puntaje de riesgo (base de conocimiento ponderada)</h3>
    <table class="reglas">
      <tr><th>Variable</th><th>Rango</th><th>Puntos</th><th>Descripcion</th></tr>
      ${filasPuntaje}
    </table>
    <h3>Reglas de riesgo (puntaje total -> decision)</h3>
    <table class="reglas">
      <tr><th>Rango de puntaje</th><th>Nivel de riesgo</th><th>Decision</th><th>Descripcion</th></tr>
      ${filasRiesgo}
    </table>
  `;

  panelFormulario.classList.add('oculto');
  panelHistorial.classList.add('oculto');
  panelReglas.classList.remove('oculto');
});

document.getElementById('btnCerrarReglas').addEventListener('click', () => {
  panelReglas.classList.add('oculto');
  panelFormulario.classList.remove('oculto');
});

function etiquetaRiesgo(nivel) {
  return { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' }[nivel] || nivel;
}

let ultimoHistorial = [];

document.getElementById('btnVerHistorial').addEventListener('click', async () => {
  const resp = await fetch('/api/solicitudes');
  const data = await resp.json();
  ultimoHistorial = data.solicitudes;

  const filas = data.solicitudes.map(s => `
    <tr>
      <td>#${s.id}</td>
      <td>${s.nombre}</td>
      <td>${s.puntaje_total ?? '—'}</td>
      <td><span class="badge-riesgo badge-${s.nivel_riesgo}">${etiquetaRiesgo(s.nivel_riesgo)}</span></td>
      <td>${etiquetaDecision(s.decision)}</td>
      <td>${(s.certeza * 100).toFixed(0)}%</td>
      <td>${s.creado_en}</td>
    </tr>
  `).join('');

  document.getElementById('contenidoHistorial').innerHTML = data.solicitudes.length === 0
    ? `<p class="nota-ayuda">Todavia no hay ninguna solicitud evaluada.</p>`
    : `
      <table class="reglas">
        <tr><th>Folio</th><th>Nombre</th><th>Puntaje</th><th>Riesgo</th><th>Decision</th><th>Certeza</th><th>Fecha</th></tr>
        ${filas}
      </table>
    `;

  panelFormulario.classList.add('oculto');
  panelReglas.classList.add('oculto');
  panelHistorial.classList.remove('oculto');
});

document.getElementById('btnCerrarHistorial').addEventListener('click', () => {
  panelHistorial.classList.add('oculto');
  panelFormulario.classList.remove('oculto');
});

document.getElementById('btnExportarHistorial').addEventListener('click', () => {
  if (!ultimoHistorial.length) return;

  const encabezados = ['Folio', 'Nombre', 'Puntaje crediticio', 'Nivel de riesgo', 'Decision', 'Certeza (%)', 'Fecha'];
  const filas = ultimoHistorial.map(s => [
    s.id,
    s.nombre,
    s.puntaje_total ?? '',
    etiquetaRiesgo(s.nivel_riesgo),
    etiquetaDecision(s.decision).replace(/\s+/g, ' '),
    (s.certeza * 100).toFixed(0),
    s.creado_en
  ]);

  const escapar = valor => `"${String(valor).replace(/"/g, '""')}"`;
  const csv = [encabezados, ...filas]
    .map(fila => fila.map(escapar).join(';'))
    .join('\r\n');

  // El BOM al inicio asegura que Excel muestre correctamente acentos y ñ
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `historial_solicitudes_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
});
