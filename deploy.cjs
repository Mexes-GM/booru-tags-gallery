#!/usr/bin/env node

/**
 * Script de despliegue automatizado para producción
 * Este script ejecuta todas las verificaciones y optimizaciones necesarias antes del despliegue
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando proceso de despliegue a producción...\n');

const steps = [
  {
    name: 'Verificación de dependencias',
    command: 'npm audit --audit-level=high',
    description: 'Verificando vulnerabilidades de seguridad'
  },
  {
    name: 'Verificación de tipos TypeScript',
    command: 'npm run type-check',
    description: 'Verificando tipos TypeScript'
  },
  {
    name: 'Verificación de linting',
    command: 'npm run lint',
    description: 'Verificando calidad del código'
  },
  {
    name: 'Verificación pre-producción',
    command: 'npm run pre-production-check',
    description: 'Ejecutando verificaciones de pre-producción'
  },
  {
    name: 'Tests',
    command: 'npm test',
    description: 'Ejecutando tests'
  },
  {
    name: 'Generación de índice Fuse',
    command: 'npm run generate-fuse-index',
    description: 'Generando índice de búsqueda optimizado'
  },
  {
    name: 'Build de producción',
    command: 'npm run build:production',
    description: 'Construyendo aplicación para producción'
  }
];

let currentStep = 0;
const totalSteps = steps.length;

function executeStep(step) {
  currentStep++;
  console.log(`📋 Paso ${currentStep}/${totalSteps}: ${step.name}`);
  console.log(`   ${step.description}`);
  
  try {
    const startTime = Date.now();
    execSync(step.command, { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    const duration = Date.now() - startTime;
    console.log(`   ✅ Completado en ${duration}ms\n`);
    return true;
  } catch (error) {
    console.log(`   ❌ Error en: ${step.name}`);
    console.log(`   Error: ${error.message}\n`);
    return false;
  }
}

function checkPrerequisites() {
  console.log('🔍 Verificando prerequisitos...');
  
  // Verificar que estamos en el directorio correcto
  if (!fs.existsSync('package.json')) {
    console.log('❌ Error: No se encontró package.json. Ejecuta este script desde la raíz del proyecto.');
    process.exit(1);
  }
  
  // Verificar que node_modules existe
  if (!fs.existsSync('node_modules')) {
    console.log('📦 Instalando dependencias...');
    execSync('npm install', { stdio: 'inherit' });
  }
  
  console.log('✅ Prerequisitos verificados\n');
}

function generateDeploymentReport() {
  console.log('📊 Generando reporte de despliegue...');
  
  const distPath = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(distPath)) {
    console.log('❌ Error: Directorio dist no encontrado');
    return;
  }
  
  // Calcular tamaño del build
  function getDirectorySize(dirPath) {
    let totalSize = 0;
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        totalSize += getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }
  
  const buildSize = getDirectorySize(distPath);
  const buildSizeMB = (buildSize / (1024 * 1024)).toFixed(2);
  
  const report = {
    timestamp: new Date().toISOString(),
    buildSize: `${buildSizeMB} MB`,
    buildSizeBytes: buildSize,
    deploymentReady: true,
    steps: steps.map(step => ({
      name: step.name,
      status: 'completed'
    }))
  };
  
  fs.writeFileSync('deployment-report.json', JSON.stringify(report, null, 2));
  
  console.log(`✅ Build completado: ${buildSizeMB} MB`);
  console.log('📄 Reporte guardado en: deployment-report.json\n');
}

function showNextSteps() {
  console.log('🎉 ¡Despliegue preparado exitosamente!');
  console.log('\n📋 Próximos pasos:');
  console.log('   1. Revisar el reporte en deployment-report.json');
  console.log('   2. Para desplegar a Netlify: npm run deploy:netlify');
  console.log('   3. Para preview: npm run deploy:preview');
  console.log('\n🔗 Comandos útiles:');
  console.log('   • npm run preview - Vista previa local del build');
  console.log('   • npm run deploy:netlify - Despliegue a producción');
  console.log('   • npm run deploy:preview - Despliegue de preview\n');
}

// Ejecutar el proceso de despliegue
async function main() {
  try {
    checkPrerequisites();
    
    // Ejecutar todos los pasos
    for (const step of steps) {
      const success = executeStep(step);
      if (!success) {
        console.log('❌ Despliegue cancelado debido a errores.');
        process.exit(1);
      }
    }
    
    generateDeploymentReport();
    showNextSteps();
    
  } catch (error) {
    console.log(`❌ Error inesperado: ${error.message}`);
    process.exit(1);
  }
}

main();