/**
 * Cruza las dos listas del Directorio y prepara las fichas para revisión.
 *
 *   node scripts/cruzar-directorio.mjs
 *
 * Hay dos fuentes y ninguna sirve sola:
 *
 *   - `datos-privados/aceptaciones.csv` — quién CONSINTIÓ que se publique lo
 *     suyo, con el correo, el nombre del negocio y los nombres y grados de sus
 *     estudiantes. Es la lista de quién quiere salir.
 *   - `Formulario de Registro al Directorio Profesional.xlsx` — qué se publica:
 *     teléfono, descripción y redes. Es la lista de qué se publica.
 *
 * El resultado va a `datos-privados/borrador.json`, que NO entra al repositorio
 * —lleva nombres de menores— y se revisa antes de insertarlo en Supabase.
 *
 * NO inserta nada ni toca la base: solo lee y escribe el borrador.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const XLSX = 'Formulario de Registro al Directorio Profesional.xlsx';
const ACEPTACIONES = 'datos-privados/aceptaciones.csv';
const SALIDA = 'datos-privados/borrador.json';

// --- leer el .xlsx sin dependencias -----------------------------------------
// Un .xlsx es un zip con XML dentro. Se lee a mano para no añadir una
// dependencia a un proyecto que hoy solo tiene Astro y sharp.

function leerZip(ruta) {
  const buf = readFileSync(ruta);
  const archivos = {};
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  let off = buf.readUInt32LE(i + 16);
  const total = buf.readUInt16LE(i + 10);
  for (let n = 0; n < total; n++) {
    const nombreLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const comentLen = buf.readUInt16LE(off + 32);
    const nombre = buf.toString('utf8', off + 46, off + 46 + nombreLen);
    const local = buf.readUInt32LE(off + 42);
    const metodo = buf.readUInt16LE(off + 10);
    const comprimido = buf.readUInt32LE(off + 20);
    const lNombre = buf.readUInt16LE(local + 26);
    const lExtra = buf.readUInt16LE(local + 28);
    const inicio = local + 30 + lNombre + lExtra;
    const datos = buf.subarray(inicio, inicio + comprimido);
    archivos[nombre] = metodo === 0 ? datos : inflateRawSync(datos);
    off += 46 + nombreLen + extraLen + comentLen;
  }
  return archivos;
}

const textoDe = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);

function leerHoja(zip) {
  const compartidas = textoDe(zip['xl/sharedStrings.xml'].toString('utf8')).map((t) =>
    t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
  );
  const hoja = zip['xl/worksheets/sheet1.xml'].toString('utf8');
  const filas = {};
  for (const m of hoja.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const [, col, fila, attrs, cuerpo] = m;
    const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
    if (v === undefined) continue;
    const valor = /t="s"/.test(attrs) ? compartidas[Number(v)] : v;
    (filas[fila] ??= {})[col] = String(valor ?? '').trim();
  }
  return Object.entries(filas)
    .filter(([n]) => Number(n) > 1)
    .map(([, f]) => f)
    .filter((f) => f.F);
}

// --- normalizaciones ---------------------------------------------------------

const sinTildes = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const palabras = (s) => new Set(sinTildes(s).toLowerCase().match(/[a-z]{4,}/g) ?? []);

/** Excel guarda los teléfonos como número: "3.212371689E9" -> "321 237 1689". */
function telefono(bruto) {
  let d = String(bruto ?? '').trim();
  if (/e\+?\d+$/i.test(d) || /^\d+\.\d+$/.test(d)) d = String(Math.round(Number(d)));
  d = d.replace(/\D/g, '').replace(/^57(?=\d{10}$)/, '');
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return d;
}

/**
 * La columna del enlace es un revoltijo: dominios, arrobas, URL de Instagram,
 * LinkedIn, y basura como ".", "N/A" o el propio nombre de la empresa.
 */
function enlaces(bruto) {
  const s = String(bruto ?? '').trim();
  const l = s.toLowerCase();
  if (!s || ['.', 'n/a', 'na', 'n7a', 'ninguno', '-'].includes(l)) return {};
  if (l.includes('linkedin')) return { web: s.replace(/^https?:\/\//i, '') };
  const insta = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(s) ?? /@([A-Za-z0-9._]+)/.exec(s);
  if (insta) return { instagram: '@' + insta[1] };
  if (/\(instagram\)/i.test(s)) return { instagram: '@' + s.replace(/\s*\(instagram\)/i, '').trim() };
  if (/^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(l)) {
    return { web: s.replace(/^https?:\/\//i, '').replace(/\/+$/, '') };
  }
  return { revisar_enlace: s };
}

/**
 * Recorta por final de frase hasta el máximo. No reescribe ni resume.
 *
 * El máximo era 200 y dejó cortadas 6 de las 12 primeras fichas —una perdió
 * casi mil caracteres escritos por la propia familia—. Ahora es el mismo 1.200
 * que acepta el formulario: la tarjeta del catálogo recorta por líneas, así que
 * el largo del texto ya no descuadra nada.
 */
function recortar(texto, max = 1200) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return { desc: t, recortada: false };
  const corte = t.slice(0, max + 1);
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '));
  if (fin > 60) return { desc: t.slice(0, fin + 1).trim(), recortada: true };
  const espacio = corte.lastIndexOf(' ');
  return { desc: t.slice(0, espacio > 0 ? espacio : max).trim() + '…', recortada: true };
}

/**
 * El grado sale del texto de estudiantes: "Matías Rodríguez Zapata K5B" -> 5B.
 * Se acepta con o sin la K delante, que es como lo escriben las familias.
 */
function grado(texto) {
  const encontrados = [...String(texto ?? '').matchAll(/\b[kK]?(1[0-2]|[1-9])\s?([A-Da-d])\b/g)].map(
    (m) => m[1] + m[2].toUpperCase(),
  );
  const unicos = [...new Set(encontrados)];
  if (!unicos.length) return { grado: null, revisar: 'no se pudo leer el grado' };
  if (unicos.length > 1) return { grado: unicos[0], revisar: `varios grados: ${unicos.join(', ')}` };
  return { grado: unicos[0], revisar: null };
}

// --- el cruce ----------------------------------------------------------------

function leerCsv(ruta) {
  const texto = readFileSync(ruta, 'utf8');
  const filas = [];
  let campo = '';
  let fila = [];
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim()));
}

if (!existsSync(ACEPTACIONES)) {
  console.error(`Falta ${ACEPTACIONES}.`);
  console.error('Exporta la hoja de aceptaciones a CSV y guárdala ahí.');
  process.exit(1);
}

const directorio = leerHoja(leerZip(XLSX));
const [, ...aceptaciones] = leerCsv(ACEPTACIONES);

const fichas = [];
for (const fila of aceptaciones) {
  const [nombrePila, apellido, correo, estudiantes, negocio, logo] = fila;
  if (!negocio?.trim()) continue;

  // Se busca por correo, luego por nombre exacto, luego por parecido, y en
  // último lugar por apellido. Cuanto más abajo, más hay que mirarlo a ojo.
  let pareja = null;
  let via = null;
  pareja = directorio.find((d) => clave(d.E) === clave(correo));
  if (pareja) via = 'correo';
  if (!pareja) {
    pareja = directorio.find((d) => clave(d.F) === clave(negocio));
    if (pareja) via = 'nombre exacto';
  }
  if (!pareja) {
    let mejor = { punt: 0, fila: null };
    for (const d of directorio) {
      const a = palabras(negocio);
      const b = palabras(d.F);
      if (!a.size || !b.size) continue;
      const comunes = [...a].filter((w) => b.has(w)).length;
      const punt = comunes / new Set([...a, ...b]).size;
      if (punt > mejor.punt) mejor = { punt, fila: d };
    }
    if (mejor.punt >= 0.3) { pareja = mejor.fila; via = `parecido ${Math.round(mejor.punt * 100)}%`; }
  }
  if (!pareja) {
    const ape = clave(apellido.split(' ')[0]);
    pareja = ape && directorio.find((d) => clave(d.C).includes(ape));
    if (pareja) via = 'apellido';
  }

  const revisar = [];
  if (!pareja) revisar.push('SIN PAREJA en el Directorio: hay que completar a mano');
  if (via && via !== 'correo' && via !== 'nombre exacto') {
    revisar.push(`emparejado por ${via}: confirmar que es el mismo negocio`);
  }

  const g = grado(estudiantes);
  if (g.revisar) revisar.push(g.revisar);

  const { desc, recortada } = recortar(pareja?.H);
  if (recortada) revisar.push('descripción recortada');
  if (!desc) revisar.push('sin descripción');

  const tel = telefono(pareja?.D);
  if (!tel || tel.replace(/\s/g, '').length < 7) revisar.push(`teléfono dudoso: ${tel || 'ninguno'}`);

  const enl = enlaces(pareja?.G);
  if (enl.revisar_enlace) revisar.push(`el enlace no se entiende: ${enl.revisar_enlace}`);

  fichas.push({
    // --- lo que se publica ---
    nombre: negocio.trim(),
    categoria: '',                       // la asigna una persona
    descripcion: desc,
    grado: g.grado,
    telefono: tel,
    direccion: null,                     // el Directorio nunca la pidió
    web: enl.web ?? null,
    instagram: enl.instagram ?? null,
    facebook: null,
    // --- interno, no se publica ---
    estudiantes: estudiantes?.trim() ?? '',
    acudiente_nombre: `${nombrePila ?? ''} ${apellido ?? ''}`.trim(),
    acudiente_correo: (correo ?? '').trim().toLowerCase(),
    acudiente_telefono: tel,
    // --- trazabilidad y revisión ---
    emparejado_por: via ?? 'ninguno',
    nombre_en_directorio: pareja?.F ?? null,
    logo_jotform: logo || null,
    revisar,
  });
}

mkdirSync('datos-privados', { recursive: true });
writeFileSync(SALIDA, JSON.stringify(fichas, null, 2) + '\n', 'utf8');

const conPareja = fichas.filter((f) => f.emparejado_por !== 'ninguno').length;
const conAvisos = fichas.filter((f) => f.revisar.length).length;
console.log(`  ${fichas.length} fichas · ${conPareja} emparejadas · ${conAvisos} necesitan revisión`);
console.log(`  escrito en ${SALIDA} (fuera del repositorio: lleva nombres de menores)`);
