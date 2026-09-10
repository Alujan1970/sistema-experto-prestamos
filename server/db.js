// Conexion unica a la base de datos SQLite, reutilizada por toda la app.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'db', 'sistema_experto.db');

if (!fs.existsSync(DB_PATH)) {
  // Primer arranque: crea el esquema y siembra la base de conocimiento.
  require('../db/seed.js');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function cargarBaseConocimiento() {
  return {
    reglasExclusion: db.prepare('SELECT * FROM reglas_exclusion WHERE activa = 1').all(),
    reglasPuntaje: db.prepare('SELECT * FROM reglas_puntaje').all(),
    reglasPuntajeCredito: db.prepare('SELECT * FROM reglas_puntaje_credito').all(),
    reglasRiesgo: db.prepare('SELECT * FROM reglas_riesgo').all()
  };
}

module.exports = { db, cargarBaseConocimiento };
