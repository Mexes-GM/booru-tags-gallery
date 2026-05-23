// Script optimizado para pre-generar el índice de Fuse.js para tags.json
// Ejecutar con: node scripts/generate-fuse-index.cjs

const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

const TAGS_PATH = path.join(__dirname, '../public/data/tags.json');
const INDEX_PATH = path.join(__dirname, '../public/data/fuse-index.json');
const TAG_GROUPS_PATH = path.join(__dirname, '../public/data/tag-groups.json');
const INDEX_GROUPS_PATH = path.join(__dirname, '../public/data/fuse-index-tag-groups.json');

function main() {
  const startTime = Date.now();
  
  const tagsRaw = fs.readFileSync(TAGS_PATH, 'utf8');
  const tags = JSON.parse(tagsRaw);
  
  if (!Array.isArray(tags)) {
    throw new Error('tags.json debe ser un array de objetos');
  }

  // Opciones optimizadas de Fuse.js para búsquedas más inclusivas (tags)
  const fuseOptions = {
    keys: [
      { name: 'name', weight: 1.0 },
      { name: 'displayName', weight: 0.8 },
      { name: 'aliases', weight: 0.5 }
    ],
    // Configuración optimizada para búsquedas más inclusivas
    threshold: 0.6, // Aumentar threshold para capturar más resultados
    includeScore: true,
    includeMatches: true, // Habilitar para poder analizar las coincidencias
    minMatchCharLength: 2, // Mínimo 2 caracteres
    ignoreLocation: false, // Importante: mantener location para priorizar coincidencias al inicio
    distance: 200, // Aumentar distancia para mejor cobertura
    shouldSort: true,
    findAllMatches: false, // Deshabilitar para mejor performance
    useExtendedSearch: false,
    // Nuevas optimizaciones
    isCaseSensitive: false,
    tokenize: true,
    matchAllTokens: false,
    location: 0,
    cache: true
  };

  // Limitar a 100k tags si es necesario
  const maxTags = 100000;
  const tagsToIndex = tags.slice(0, maxTags);
  
  const indexStartTime = Date.now();
  
  const fuseIndex = Fuse.createIndex(fuseOptions.keys, tagsToIndex);

  const indexTime = Date.now() - indexStartTime;
  
  // Guardar el índice serializado
  const saveStartTime = Date.now();
  
  const indexData = fuseIndex.toJSON();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(indexData));
  
  const saveTime = Date.now() - saveStartTime;
  const totalTime = Date.now() - startTime;
  
  // Estadísticas del archivo
  const stats = fs.statSync(INDEX_PATH);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  // Verificar que el índice se puede cargar correctamente
  try {
    const testFuse = new Fuse(tagsToIndex.slice(0, 100), fuseOptions, fuseIndex);
    const testResults = testFuse.search('test');
  } catch (error) {
    console.error('❌ Error al verificar índice:', error.message);
  }

  // Generar índice para Tag Groups si existe el archivo
  if (fs.existsSync(TAG_GROUPS_PATH)) {
    try {
      const groupsRaw = fs.readFileSync(TAG_GROUPS_PATH, 'utf8');
      const groupsJson = JSON.parse(groupsRaw);
      const groups = Array.isArray(groupsJson.groups) ? groupsJson.groups : [];
      const groupsToIndex = groups.map(g => ({
        id: String(g.id),
        title: String(g.title || ''),
        parents: Array.isArray(g.parents) ? g.parents.map(String) : [],
        children: Array.isArray(g.children) ? g.children.map(String) : []
      }));

      const tgOptions = {
        keys: [
          { name: 'id', weight: 1.0 },
          { name: 'title', weight: 0.9 }
        ],
        threshold: 0.35,
        includeScore: true,
        useExtendedSearch: true,
        shouldSort: true,
        minMatchCharLength: 1,
        ignoreLocation: true,
        distance: 100,
        isCaseSensitive: false,
        location: 0,
        findAllMatches: false
      };

      const tgIndex = Fuse.createIndex(tgOptions.keys, groupsToIndex);
      fs.writeFileSync(INDEX_GROUPS_PATH, JSON.stringify(tgIndex.toJSON()));
    } catch (e) {
      console.error('❌ Error al generar índice de tag groups:', e.message);
    }
  }
}

// Manejo de errores
try {
  main();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}