#!/usr/bin/env node

/**
 * Script de optimización de rendimiento para producción
 * Optimiza archivos estáticos, genera índices de búsqueda y prepara assets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🚀 Iniciando optimización para producción...\n');

/**
 * Verifica que existan los archivos críticos
 */
function checkCriticalFiles() {
  console.log('📋 Verificando archivos críticos...');
  
  const criticalFiles = [
    'public/data/tags.json',
    'public/data/fuse-index.json',
    'src/main.tsx',
    'index.html'
  ];

  const missingFiles = [];
  
  criticalFiles.forEach(file => {
    const filePath = path.join(projectRoot, file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  });

  if (missingFiles.length > 0) {
    console.error('❌ Archivos críticos faltantes:');
    missingFiles.forEach(file => console.error(`   - ${file}`));
    process.exit(1);
  }
  
  console.log('✅ Todos los archivos críticos están presentes\n');
}

/**
 * Optimiza el archivo de configuración de la aplicación
 */
function optimizeAppConfig() {
  console.log('⚙️ Optimizando configuración de la aplicación...');
  
  const configPath = path.join(projectRoot, 'src/config/appConfig.ts');
  
  if (fs.existsSync(configPath)) {
    let config = fs.readFileSync(configPath, 'utf8');
    
    // Asegurar que está en modo producción
    config = config.replace(
      /isDevelopment:\s*true/g,
      'isDevelopment: false'
    );
    
    // Optimizar configuraciones para producción
    config = config.replace(
      /enableDebugLogs:\s*true/g,
      'enableDebugLogs: false'
    );
    
    fs.writeFileSync(configPath, config);
    console.log('✅ Configuración optimizada para producción\n');
  }
}

/**
 * Verifica el tamaño de los archivos de datos
 */
function checkDataFileSizes() {
  console.log('📊 Verificando tamaños de archivos de datos...');
  
  const dataFiles = [
    'public/data/tags.json',
    'public/data/fuse-index.json'
  ];

  dataFiles.forEach(file => {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`   ${file}: ${sizeInMB} MB`);
      
      if (stats.size > 50 * 1024 * 1024) { // 50MB
        console.warn(`⚠️  Advertencia: ${file} es muy grande (${sizeInMB} MB)`);
      }
    }
  });
  
  console.log('');
}

/**
 * Optimiza archivos de worker
 */
function optimizeWorkers() {
  console.log('🔧 Optimizando workers...');
  
  const workerPath = path.join(projectRoot, 'src/workers/tagSearch.worker.ts');
  
  if (fs.existsSync(workerPath)) {
    let workerContent = fs.readFileSync(workerPath, 'utf8');
    
    // Remover console.log en producción
    workerContent = workerContent.replace(/console\.log\([^)]*\);?\s*/g, '');
    
    fs.writeFileSync(workerPath, workerContent);
    console.log('✅ Workers optimizados\n');
  }
}

/**
 * Genera reporte de optimización
 */
function generateOptimizationReport() {
  console.log('📄 Generando reporte de optimización...');
  
  const report = {
    timestamp: new Date().toISOString(),
    optimizations: [
      'Configuración de aplicación optimizada para producción',
      'Workers optimizados (console.log removidos)',
      'Archivos críticos verificados',
      'Tamaños de archivos de datos verificados'
    ],
    buildConfig: {
      target: 'esnext',
      minify: 'terser',
      sourcemap: false,
      chunkSizeWarningLimit: 1000
    }
  };

  const reportPath = path.join(projectRoot, 'optimization-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('✅ Reporte generado en optimization-report.json\n');
}

/**
 * Función principal
 */
async function main() {
  try {
    checkCriticalFiles();
    optimizeAppConfig();
    checkDataFileSizes();
    optimizeWorkers();
    generateOptimizationReport();
    
    console.log('🎉 Optimización completada exitosamente!');
    console.log('📦 La aplicación está lista para el build de producción');
    console.log('💡 Ejecuta "npm run build" para generar los archivos de producción\n');
    
  } catch (error) {
    console.error('❌ Error durante la optimización:', error.message);
    process.exit(1);
  }
}

main();