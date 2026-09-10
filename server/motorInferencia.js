// ============================================================
// motorInferencia.js
//
// EL MOTOR DE INFERENCIA del sistema experto.
// No contiene ninguna regla de negocio "quemada" en el codigo: todas las
// reglas viven en la base de datos (tablas reglas_exclusion, reglas_puntaje,
// reglas_riesgo -> la "base de conocimiento"). Este modulo solo sabe COMO
// interpretar y encadenar esas reglas contra los "hechos" de un solicitante.
//
// Estrategia de encadenamiento: ENCADENAMIENTO HACIA ADELANTE (forward
// chaining) en dos fases:
//   Fase 1 - Reglas duras (exclusion): si UNA sola se cumple, se corta la
//            cadena y el resultado es rechazo inmediato (certeza = 1.0).
//   Fase 2 - Reglas blandas (puntaje): se evaluan todas, se suman los
//            puntos (0-100) y ese puntaje dispara la regla de riesgo
//            correspondiente (bajo/medio/alto -> aprobado/condicionado/
//            rechazado), con un factor de certeza derivado de que tan
//            lejos esta el puntaje de la frontera entre niveles.
// ============================================================

/**
 * A partir de los datos crudos que llenó el solicitante en el formulario,
 * calcula los "hechos derivados" que usan las reglas. Esto es la MEMORIA
 * DE TRABAJO (working memory) del sistema experto: hechos originales +
 * hechos inferidos a partir de ellos.
 *
 * NOTA: puntaje_crediticio ya no llega en los datos del formulario -- el
 * propio motor lo infiere (ver calcularPuntajeCreditoEstimado), como
 * sustituto simplificado de una consulta a un buro de credito externo.
 */
function calcularHechosDerivados(datos, reglasPuntajeCredito) {
  const {
    edad, ingreso_mensual, tipo_empleo, tipo_ingreso, antiguedad_laboral_meses,
    historial_pagos, deudas_mensuales, monto_solicitado, plazo_meses
  } = datos;

  // Tasa de interes anual asumida por la institucion (politica del negocio)
  const TASA_ANUAL = 0.18;
  const tasaMensual = TASA_ANUAL / 12;

  // Cuota mensual estimada con sistema frances de amortizacion:
  // cuota = P * i / (1 - (1+i)^-n)
  const cuotaEstimada =
    monto_solicitado * tasaMensual /
    (1 - Math.pow(1 + tasaMensual, -plazo_meses));

  // Relacion deuda/ingreso (RDI) INCLUYENDO el nuevo prestamo, en porcentaje
  const rdi = ((deudas_mensuales + cuotaEstimada) / ingreso_mensual) * 100;

  // Endeudamiento previo: solo las deudas YA existentes, antes de este
  // prestamo. Se usa para estimar el puntaje crediticio (un buro real
  // tampoco conoce todavia el prestamo que se esta solicitando).
  const endeudamientoPrevio = (deudas_mensuales / ingreso_mensual) * 100;

  // Estabilidad laboral efectiva: antiguedad ponderada por tipo de contrato.
  // Un empleado asalariado "cuenta" el 100% de sus meses; un independiente,
  // 70% (ingreso menos predecible); un desempleado, 0% (ademas dispara
  // exclusion aparte).
  const factorEstabilidad = { asalariado: 1, independiente: 0.7, desempleado: 0 };
  const estabilidadEfectiva = antiguedad_laboral_meses * (factorEstabilidad[tipo_empleo] ?? 0);

  // Codificacion numerica del historial de pagos y del tipo de ingreso,
  // para poder aplicar reglas de rango genericas (min/max)
  const codigoHistorial = { excelente: 4, bueno: 3, regular: 2, malo: 1 };
  const codigoTipoIngreso = { fijo: 1, variable: 0 };

  const hechosBase = {
    edad,
    desempleado: tipo_empleo === 'desempleado' ? 1 : 0,
    cuota_estimada: round2(cuotaEstimada),
    rdi: round2(rdi),
    endeudamiento_previo: round2(endeudamientoPrevio),
    estabilidad_efectiva: round2(estabilidadEfectiva),
    historial_pagos_cod: codigoHistorial[historial_pagos] ?? 1,
    tipo_ingreso_cod: codigoTipoIngreso[tipo_ingreso] ?? 0
  };

  // Puntaje crediticio: inferido, no capturado (ver funcion mas abajo)
  const { puntaje, disparadas } = calcularPuntajeCreditoEstimado(hechosBase, reglasPuntajeCredito);

  return {
    hechos: { ...hechosBase, puntaje_crediticio: puntaje },
    explicacionCredito: disparadas
  };
}

/**
 * Estima el puntaje crediticio (300-850) a partir de hechos observables
 * (historial de pagos, endeudamiento previo, estabilidad laboral y tipo de
 * ingreso), en sustitucion de una consulta a un buro de credito real. Es,
 * en si misma, una pequeña base de conocimiento con su propio motor de
 * puntaje ponderado (0-100) que luego se reescala al rango 300-850.
 */
function calcularPuntajeCreditoEstimado(hechosBase, reglasPuntajeCredito) {
  const variables = [...new Set(reglasPuntajeCredito.map(r => r.variable))];
  let totalInterno = 0;
  const disparadas = [];

  for (const variable of variables) {
    const valor = hechosBase[variable];
    if (valor === undefined) continue;

    const reglasDeEstaVariable = reglasPuntajeCredito.filter(r => r.variable === variable);
    const regla = reglasDeEstaVariable.find(r => {
      const minOk = (r.min === null || r.min === undefined) || valor >= r.min;
      const maxOk = (r.max === null || r.max === undefined) || valor <= r.max;
      return minOk && maxOk;
    });

    if (regla) {
      totalInterno += regla.puntos;
      disparadas.push({ ...regla, valorEvaluado: valor });
    }
  }

  // Reescala de 0-100 (interno) a 300-850 (rango convencional de un buro)
  const puntaje = Math.round(300 + (totalInterno / 100) * 550);

  return { puntaje, disparadas };
}

function round2(n) { return Math.round(n * 100) / 100; }

function cumpleOperador(valorHecho, operador, valorRegla) {
  switch (operador) {
    case '<': return valorHecho < valorRegla;
    case '<=': return valorHecho <= valorRegla;
    case '>': return valorHecho > valorRegla;
    case '>=': return valorHecho >= valorRegla;
    case '==': return valorHecho === valorRegla;
    default: throw new Error(`Operador de regla no soportado: ${operador}`);
  }
}

/**
 * FASE 1: evalua las reglas de exclusion (encadenamiento hacia adelante,
 * se detiene en la primera que se dispare). Devuelve la regla disparada
 * o null si el solicitante pasa el filtro.
 */
function evaluarExclusion(hechos, reglasExclusion) {
  for (const regla of reglasExclusion) {
    if (!regla.activa) continue;
    const valorHecho = hechos[regla.variable];
    if (valorHecho === undefined) continue;
    if (cumpleOperador(valorHecho, regla.operador, regla.valor)) {
      return regla;
    }
  }
  return null;
}

/**
 * FASE 2: evalua las reglas de puntaje. Para cada variable, busca la
 * primera regla cuyo rango [min,max] contenga el valor del hecho y
 * suma sus puntos. Devuelve el puntaje total y el detalle de que
 * reglas se dispararon (para el modulo de explicacion).
 */
function evaluarPuntaje(hechos, reglasPuntaje) {
  const variables = [...new Set(reglasPuntaje.map(r => r.variable))];
  let total = 0;
  const disparadas = [];

  for (const variable of variables) {
    const valor = hechos[variable];
    if (valor === undefined) continue;

    const reglasDeEstaVariable = reglasPuntaje.filter(r => r.variable === variable);
    const regla = reglasDeEstaVariable.find(r => {
      const minOk = (r.min === null || r.min === undefined) || valor >= r.min;
      const maxOk = (r.max === null || r.max === undefined) || valor <= r.max;
      return minOk && maxOk;
    });

    if (regla) {
      total += regla.puntos;
      disparadas.push({ ...regla, valorEvaluado: valor });
    }
  }

  return { total, disparadas };
}

/**
 * A partir del puntaje total, busca la regla de riesgo correspondiente
 * y calcula un FACTOR DE CERTEZA heuristico (0.6 - 1.0): mientras mas
 * lejos este el puntaje de una frontera REAL con el nivel de riesgo
 * vecino, mayor la certeza; mientras mas cerca de esa frontera, menor
 * la certeza (el caso es "limitrofe" y podria caer en el otro nivel
 * con un cambio minimo en los datos). Esto introduce, de forma
 * simplificada, el manejo de incertidumbre propio de los sistemas
 * expertos clasicos (p.ej. factores de certeza de MYCIN) sin requerir
 * logica difusa completa.
 *
 * Nota: el limite inferior de la banda mas baja (0) y el limite
 * superior de la banda mas alta (100) NO son fronteras con un nivel
 * vecino -- son simplemente el minimo/maximo posible del puntaje -- por
 * lo que no deben penalizar la certeza.
 */
function evaluarRiesgo(puntajeTotal, reglasRiesgo) {
  const regla = reglasRiesgo.find(r => puntajeTotal >= r.min && puntajeTotal <= r.max);
  if (!regla) throw new Error('No hay regla de riesgo que cubra el puntaje ' + puntajeTotal);

  const globalMin = Math.min(...reglasRiesgo.map(r => r.min));
  const globalMax = Math.max(...reglasRiesgo.map(r => r.max));
  const anchoBanda = (regla.max - regla.min) || 1;

  const fronteraInferiorEsReal = regla.min > globalMin;
  const fronteraSuperiorEsReal = regla.max < globalMax;

  const distMin = puntajeTotal - regla.min;   // distancia a la frontera inferior
  const distMax = regla.max - puntajeTotal;   // distancia a la frontera superior

  let proximidad; // 0 (justo en una frontera real) .. 1 (lo mas lejos posible de fronteras reales)

  if (fronteraInferiorEsReal && fronteraSuperiorEsReal) {
    // Banda intermedia: ambos extremos son fronteras reales.
    proximidad = Math.min(Math.min(distMin, distMax) / (anchoBanda / 2), 1);
  } else if (fronteraInferiorEsReal) {
    // Banda mas alta: solo el extremo inferior es frontera real.
    proximidad = Math.min(distMin / anchoBanda, 1);
  } else if (fronteraSuperiorEsReal) {
    // Banda mas baja: solo el extremo superior es frontera real.
    proximidad = Math.min(distMax / anchoBanda, 1);
  } else {
    // Solo existe una banda (caso degenerado): certeza maxima.
    proximidad = 1;
  }

  const certeza = round2(0.6 + 0.4 * proximidad); // rango 0.6 - 1.0

  return { regla, certeza };
}

/**
 * Punto de entrada del motor: recibe los datos del formulario + la base
 * de conocimiento (leida de la BD) y devuelve el veredicto completo con
 * su explicacion, listo para guardarse y mostrarse al usuario.
 */
function evaluarSolicitud(datosFormulario, baseConocimiento) {
  const { reglasExclusion, reglasPuntaje, reglasPuntajeCredito, reglasRiesgo } = baseConocimiento;

  const { hechos, explicacionCredito } = calcularHechosDerivados(datosFormulario, reglasPuntajeCredito);

  // Explicacion de COMO se estimo el puntaje crediticio (siempre se muestra,
  // se haya aprobado o no la solicitud despues -- es informacion, no una regla de exclusion)
  const explicacionCreditoFormateada = explicacionCredito.map(r => ({
    tipo: 'puntaje_credito',
    reglaId: r.id,
    descripcion: `${r.descripcion} (valor evaluado: ${r.valorEvaluado})`,
    puntos: r.puntos
  })).concat([{
    tipo: 'puntaje_credito',
    reglaId: null,
    descripcion: `Puntaje crediticio estimado: ${hechos.puntaje_crediticio} (escala 300-850)`,
    puntos: null
  }]);

  const reglaExclusionDisparada = evaluarExclusion(hechos, reglasExclusion);

  if (reglaExclusionDisparada) {
    return {
      hechos,
      puntajeTotal: null,
      nivelRiesgo: 'alto',
      decision: 'rechazado',
      certeza: 1.0,
      explicacion: [
        ...explicacionCreditoFormateada,
        {
          tipo: 'exclusion',
          reglaId: reglaExclusionDisparada.id,
          descripcion: reglaExclusionDisparada.mensaje,
          puntos: null
        }
      ]
    };
  }

  const { total, disparadas } = evaluarPuntaje(hechos, reglasPuntaje);
  const { regla: reglaRiesgo, certeza } = evaluarRiesgo(total, reglasRiesgo);

  return {
    hechos,
    puntajeTotal: total,
    nivelRiesgo: reglaRiesgo.nivel_riesgo,
    decision: reglaRiesgo.decision,
    certeza,
    explicacion: [
      ...explicacionCreditoFormateada,
      ...disparadas.map(r => ({
        tipo: 'puntaje',
        reglaId: r.id,
        descripcion: `${r.descripcion} (valor evaluado: ${r.valorEvaluado})`,
        puntos: r.puntos
      })),
      {
        tipo: 'puntaje',
        reglaId: reglaRiesgo.id,
        descripcion: `Puntaje total ${total}/100 -> ${reglaRiesgo.descripcion}`,
        puntos: null
      }
    ]
  };
}

module.exports = {
  calcularHechosDerivados,
  calcularPuntajeCreditoEstimado,
  evaluarExclusion,
  evaluarPuntaje,
  evaluarRiesgo,
  evaluarSolicitud
};
