/**
 * Convierte "Restaurante El Buen Sabor" -> "restaurante-el-buen-sabor"
 * y evita choques de subdominio agregando un sufijo corto si hace falta.
 */
function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function randomSuffix(len = 4) {
  return Math.random().toString(36).slice(2, 2 + len);
}

module.exports = { slugify, randomSuffix };
