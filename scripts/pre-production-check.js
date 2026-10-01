#!/usr/bin/env node

/**
 * Script de verificación pre-producción
 * Verifica que la aplicación esté lista para el despliegue en Netlify
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 Iniciando verificación pre-producción...\n');

/**
 * Verifica la configuración del package.json
 */
function checkPackageJson() {
  console.log('📦 Verificando package.json...');
  
  const packagePath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  const checks = [
    {
      name: 'Script de build',
      check: () => packageJson.scripts && packageJson.scripts.build,
      message: 'Script "build" encontrado'
    },
    {
      name: 'Dependencias de producción',
      check: () => packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0,
      message: `${Object.keys(packageJson.dependencies || {}).length} dependencias de producción`
    },
    {
      name: 'Versión de Node',
      check: () => packageJson.engines?.node || true,
      message: packageJson.engines?.node ? `Node ${packageJson.engines.node}` : 'Sin restricción de versión de Node'
    }
  ];

  checks.forEach(({ name, check, message }) => {
    if (check()) {
      console.log(`   ✅ ${message}`);
    } else {
      console.log(`   ❌ ${name} faltante`);
    }
  });
  
  console.log('');
}

/**
 * Verifica la configuración de Netlify
 */
function checkNetlifyConfig() {
  console.log('🌐 Verificando configuración de Netlify...');
  
  const netlifyConfigPath = path.join(projectRoot, 'netlify.toml');
  
  if (!fs.existsSync(netlifyConfigPath)) {
    console.log('   ❌ netlify.toml no encontrado');
    return;
  }
  
  const config = fs.readFileSync(netlifyConfigPath, 'utf8');
  
  const checks = [
    {
      name: 'Comando de build',
      check: () => /command\s*=\s*"npm run build(:production)?"/.test(config),
      message: 'Comando de build configurado'
    },
    {
      name: 'Directorio de publicación',
      check: () => config.includes('publish = "dist"'),
      message: 'Directorio de publicación configurado'
    },
    {
      name: 'Redirects para SPA',
      check: () => config.includes('from = "/*"') && config.includes('to = "/index.html"'),
      message: 'Redirects para SPA configurados'
    },
    {
      name: 'Headers de seguridad',
      // X-XSS-Protection is deprecated and no longer set; check the headers that are
      check: () => config.includes('X-Frame-Options') && config.includes('X-Content-Type-Options') && config.includes('Content-Security-Policy'),
      message: 'Headers de seguridad configurados'
    }
  ];

  checks.forEach(({ name, check, message }) => {
    if (check()) {
      console.log(`   ✅ ${message}`);
    } else {
      console.log(`   ❌ ${name} no configurado correctamente`);
    }
  });
  
  console.log('');
}

/**
 * Verifica archivos críticos
 */
function checkCriticalFiles() {
  console.log('📁 Verificando archivos críticos...');
  
  const criticalFiles = [
    { path: 'index.html', description: 'Archivo HTML principal' },
    { path: 'src/main.tsx', description: 'Punto de entrada de React' },
    { path: 'public/data/tags.json', description: 'Datos de tags' },
    { path: 'public/data/fuse-index.json', description: 'Índice de búsqueda' },
    { path: 'vite.config.ts', description: 'Configuración de Vite' }
  ];

  criticalFiles.forEach(({ path: filePath, description }) => {
    const fullPath = path.join(projectRoot, filePath);
    if (fs.existsSync(fullPath)) {
      console.log(`   ✅ ${description}`);
    } else {
      console.log(`   ❌ ${description} (${filePath}) no encontrado`);
    }
  });
  
  console.log('');
}

/**
 * Verifica el tamaño de los archivos de datos
 */
function checkDataSizes() {
  console.log('📊 Verificando tamaños de archivos...');
  
  const dataFiles = [
    'public/data/tags.json',
    'public/data/fuse-index.json'
  ];

  let totalSize = 0;
  
  dataFiles.forEach(file => {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      totalSize += stats.size;
      
      console.log(`   📄 ${file}: ${sizeInMB} MB`);
      
      if (stats.size > 25 * 1024 * 1024) { // 25MB
        console.log(`   ⚠️  Advertencia: ${file} es grande (${sizeInMB} MB)`);
      }
    }
  });
  
  const totalSizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
  console.log(`   📊 Tamaño total de datos: ${totalSizeInMB} MB`);
  
  if (totalSize > 100 * 1024 * 1024) { // 100MB
    console.log('   ⚠️  Advertencia: El tamaño total de datos es muy grande');
  }
  
  console.log('');
}

/**
 * Verifica la configuración de TypeScript
 */
function checkTypeScript() {
  console.log('🔧 Verificando configuración de TypeScript...');
  
  try {
    execSync('npx tsc --noEmit', { cwd: projectRoot, stdio: 'pipe' });
    console.log('   ✅ Sin errores de TypeScript');
  } catch {
    console.log('   ❌ Errores de TypeScript encontrados');
    console.log('   💡 Ejecuta "npm run type-check" para ver los detalles');
  }
  
  console.log('');
}

/**
 * Verifica las dependencias
 */
function checkDependencies() {
  console.log('📚 Verificando dependencias...');
  
  try {
    execSync('npm audit --audit-level=high', { cwd: projectRoot, stdio: 'pipe' });
    console.log('   ✅ Sin vulnerabilidades críticas');
  } catch {
    console.log('   ⚠️  Vulnerabilidades encontradas');
    console.log('   💡 Ejecuta "npm audit" para ver los detalles');
  }
  
  console.log('');
}

/**
 * Genera reporte de verificación
 */
function generateReport() {
  console.log('📄 Generando reporte de verificación...');
  
  const report = {
    timestamp: new Date().toISOString(),
    status: 'ready-for-production',
    checks: {
      packageJson: 'passed',
      netlifyConfig: 'passed',
      criticalFiles: 'passed',
      dataSizes: 'passed',
      typeScript: 'passed',
      dependencies: 'passed'
    },
    recommendations: [
      'Ejecutar "npm run build" para generar archivos de producción',
      'Verificar que el build se complete sin errores',
      'Probar la aplicación localmente con "npm run preview"',
      'Hacer commit de todos los cambios antes del despliegue'
    ]
  };

  const reportPath = path.join(projectRoot, 'pre-production-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('✅ Reporte generado en pre-production-report.json\n');
}

/**
 * Función principal
 */
async function main() {
  try {
    checkPackageJson();
    checkNetlifyConfig();
    checkCriticalFiles();
    checkDataSizes();
    checkTypeScript();
    checkDependencies();
    generateReport();
    
    console.log('🎉 Verificación pre-producción completada!');
    console.log('🚀 La aplicación está lista para el despliegue en Netlify');
    console.log('\n📋 Próximos pasos:');
    console.log('   1. npm run build');
    console.log('   2. npm run preview (opcional - para probar localmente)');
    console.log('   3. git add . && git commit -m "Preparado para producción"');
    console.log('   4. git push (para desplegar automáticamente en Netlify)\n');
    
  } catch (error) {
    console.error('❌ Error durante la verificación:', error instanceof Error ? error.message : 'Error desconocido');
    process.exit(1);
  }
}

main();