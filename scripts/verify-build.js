#!/usr/bin/env node

/**
 * Script de verificación post-build para detectar problemas de compresión
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Verificando archivos de build...\n');

const distPath = path.join(process.cwd(), 'dist');

if (!fs.existsSync(distPath)) {
  console.log('❌ Error: Directorio dist no encontrado');
  process.exit(1);
}

function checkFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath);
    
    console.log(`📄 ${path.basename(filePath)}:`);
    console.log(`   Tamaño: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // Verificar si el archivo parece estar comprimido incorrectamente
    if (content.length < 10) {
      console.log('   ⚠️  Archivo sospechosamente pequeño');
    }
    
    // Verificar headers de archivos JS/CSS
    const ext = path.extname(filePath);
    if (ext === '.js' || ext === '.css') {
      const firstBytes = content.slice(0, 10);
      // Verificar si comienza con caracteres de compresión gzip
      if (firstBytes[0] === 0x1f && firstBytes[1] === 0x8b) {
        console.log('   ⚠️  Archivo parece estar pre-comprimido (puede causar ERR_CONTENT_DECODING_FAILED)');
      } else {
        console.log('   ✅ Archivo sin compresión previa');
      }
    }
    
    console.log('');
  } catch (error) {
    console.log(`   ❌ Error leyendo archivo: ${error.message}\n`);
  }
}

function scanDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      scanDirectory(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.html')) {
      checkFile(filePath);
    }
  }
}

scanDirectory(distPath);

console.log('✅ Verificación completada');
console.log('\n💡 Si encuentras archivos pre-comprimidos, asegúrate de que:');
console.log('   1. Netlify no esté aplicando doble compresión');
console.log('   2. Los headers Content-Encoding no estén configurados manualmente');
console.log('   3. El build process no esté comprimiendo archivos antes de subirlos');