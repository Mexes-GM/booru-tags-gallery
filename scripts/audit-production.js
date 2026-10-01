#!/usr/bin/env node

/**
 * Production Audit Script
 * Performs comprehensive performance and quality audits
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// package.json has "type": "module", so this script must be ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AUDIT_RESULTS_DIR = path.join(__dirname, '..', 'audit-results');
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Ensure audit results directory exists
if (!fs.existsSync(AUDIT_RESULTS_DIR)) {
  fs.mkdirSync(AUDIT_RESULTS_DIR, { recursive: true });
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${title}`, 'bright');
  log(`${'='.repeat(60)}`, 'cyan');
}

function logSubsection(title) {
  log(`\n${'-'.repeat(40)}`, 'blue');
  log(`${title}`, 'blue');
  log(`${'-'.repeat(40)}`, 'blue');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function analyzeBundle() {
  logSection('BUNDLE ANALYSIS');
  
  if (!fs.existsSync(DIST_DIR)) {
    log('❌ Dist directory not found. Please run "npm run build" first.', 'red');
    return;
  }

  const stats = {
    totalSize: 0,
    files: [],
    byType: {}
  };

  function scanDirectory(dir, relativePath = '') {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativeFilePath = path.join(relativePath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDirectory(fullPath, relativeFilePath);
      } else {
        const ext = path.extname(item).toLowerCase();
        const size = stat.size;
        
        stats.totalSize += size;
        stats.files.push({
          path: relativeFilePath,
          size,
          type: ext || 'no-ext'
        });
        
        if (!stats.byType[ext || 'no-ext']) {
          stats.byType[ext || 'no-ext'] = { count: 0, size: 0 };
        }
        stats.byType[ext || 'no-ext'].count++;
        stats.byType[ext || 'no-ext'].size += size;
      }
    }
  }

  scanDirectory(DIST_DIR);

  // Sort files by size (largest first)
  stats.files.sort((a, b) => b.size - a.size);

  log(`📦 Total bundle size: ${formatBytes(stats.totalSize)}`, 'green');
  log(`📄 Total files: ${stats.files.length}`, 'green');

  logSubsection('Files by Type');
  Object.entries(stats.byType)
    .sort(([,a], [,b]) => b.size - a.size)
    .forEach(([type, data]) => {
      log(`${type.padEnd(10)} ${data.count.toString().padStart(3)} files  ${formatBytes(data.size).padStart(10)}`);
    });

  logSubsection('Largest Files (Top 10)');
  stats.files.slice(0, 10).forEach((file, index) => {
    const sizeStr = formatBytes(file.size).padStart(10);
    log(`${(index + 1).toString().padStart(2)}. ${sizeStr}  ${file.path}`);
  });

  // Check for potential issues
  logSubsection('Bundle Health Check');
  const largeFiles = stats.files.filter(f => f.size > 1024 * 1024); // > 1MB
  const jsFiles = stats.files.filter(f => f.type === '.js');
  const cssFiles = stats.files.filter(f => f.type === '.css');
  const imageFiles = stats.files.filter(f => ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'].includes(f.type));

  if (largeFiles.length > 0) {
    log(`⚠️  ${largeFiles.length} files larger than 1MB found`, 'yellow');
  } else {
    log('✅ No files larger than 1MB', 'green');
  }

  const totalJsSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
  const totalCssSize = cssFiles.reduce((sum, f) => sum + f.size, 0);
  const totalImageSize = imageFiles.reduce((sum, f) => sum + f.size, 0);

  log(`📜 JavaScript: ${formatBytes(totalJsSize)} (${jsFiles.length} files)`);
  log(`🎨 CSS: ${formatBytes(totalCssSize)} (${cssFiles.length} files)`);
  log(`🖼️  Images: ${formatBytes(totalImageSize)} (${imageFiles.length} files)`);

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalSize: stats.totalSize,
      totalFiles: stats.files.length,
      totalSizeFormatted: formatBytes(stats.totalSize)
    },
    byType: Object.fromEntries(
      Object.entries(stats.byType).map(([type, data]) => [
        type,
        { ...data, sizeFormatted: formatBytes(data.size) }
      ])
    ),
    largestFiles: stats.files.slice(0, 20).map(f => ({
      ...f,
      sizeFormatted: formatBytes(f.size)
    })),
    healthCheck: {
      largeFiles: largeFiles.length,
      totalJsSize: formatBytes(totalJsSize),
      totalCssSize: formatBytes(totalCssSize),
      totalImageSize: formatBytes(totalImageSize)
    }
  };

  fs.writeFileSync(
    path.join(AUDIT_RESULTS_DIR, 'bundle-analysis.json'),
    JSON.stringify(report, null, 2)
  );

  return report;
}

function checkDependencies() {
  logSection('DEPENDENCY ANALYSIS');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    log(`📦 Total dependencies: ${Object.keys(deps).length}`, 'green');
    log(`🏗️  Production dependencies: ${Object.keys(packageJson.dependencies || {}).length}`, 'green');
    log(`🔧 Development dependencies: ${Object.keys(packageJson.devDependencies || {}).length}`, 'green');

    // Check for potential security issues
    logSubsection('Security Check');
    try {
      execSync('npm audit --audit-level=moderate --json > audit-results/npm-audit.json', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
      });
      
      const auditResult = JSON.parse(fs.readFileSync(path.join(AUDIT_RESULTS_DIR, 'npm-audit.json'), 'utf8'));
      
      if (auditResult.metadata && auditResult.metadata.vulnerabilities) {
        const vulns = auditResult.metadata.vulnerabilities;
        const total = vulns.info + vulns.low + vulns.moderate + vulns.high + vulns.critical;
        
        if (total > 0) {
          log(`⚠️  Found ${total} vulnerabilities:`, 'yellow');
          if (vulns.critical > 0) log(`   🔴 Critical: ${vulns.critical}`, 'red');
          if (vulns.high > 0) log(`   🟠 High: ${vulns.high}`, 'red');
          if (vulns.moderate > 0) log(`   🟡 Moderate: ${vulns.moderate}`, 'yellow');
          if (vulns.low > 0) log(`   🔵 Low: ${vulns.low}`, 'blue');
          if (vulns.info > 0) log(`   ⚪ Info: ${vulns.info}`, 'reset');
        } else {
          log('✅ No known vulnerabilities found', 'green');
        }
      }
    } catch {
      log('⚠️  Could not run security audit', 'yellow');
    }

  } catch (error) {
    log('❌ Error analyzing dependencies', 'red');
    console.error(error.message);
  }
}

function checkBuildConfiguration() {
  logSection('BUILD CONFIGURATION CHECK');
  
  const configFiles = [
    'vite.config.ts',
    'vite.config.js',
    'tsconfig.json',
    'package.json',
    'vercel.json',
    'netlify.toml'
  ];

  const existingConfigs = [];
  const missingConfigs = [];

  configFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      existingConfigs.push(file);
    } else {
      missingConfigs.push(file);
    }
  });

  log(`✅ Found configuration files: ${existingConfigs.join(', ')}`, 'green');
  if (missingConfigs.length > 0) {
    log(`⚠️  Missing configuration files: ${missingConfigs.join(', ')}`, 'yellow');
  }

  // Check Vite config for production optimizations
  const viteConfigPath = path.join(__dirname, '..', 'vite.config.ts');
  if (fs.existsSync(viteConfigPath)) {
    const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
    
    logSubsection('Vite Configuration Check');
    
    const checks = [
      { name: 'Minification enabled', pattern: /minify.*true|minify.*['"]terser['"]/, found: false },
      { name: 'Code splitting configured', pattern: /manualChunks/, found: false },
      { name: 'PWA / service worker (vite-plugin-pwa)', pattern: /VitePWA[(]/, found: false },
      { name: 'Bundle analyzer', pattern: /rollup-plugin-visualizer|rollup-plugin-analyzer|vite-bundle-analyzer/, found: false }
    ];

    checks.forEach(check => {
      check.found = check.pattern.test(viteConfig);
      const status = check.found ? '✅' : '⚠️ ';
      const color = check.found ? 'green' : 'yellow';
      log(`${status} ${check.name}`, color);
    });
  }
}

function generateSummaryReport() {
  logSection('AUDIT SUMMARY');
  
  const timestamp = new Date().toISOString();
  const summary = {
    timestamp,
    auditVersion: '1.0.0',
    status: 'completed',
    recommendations: []
  };

  // Read bundle analysis if available
  const bundleAnalysisPath = path.join(AUDIT_RESULTS_DIR, 'bundle-analysis.json');
  if (fs.existsSync(bundleAnalysisPath)) {
    const bundleAnalysis = JSON.parse(fs.readFileSync(bundleAnalysisPath, 'utf8'));
    summary.bundleSize = bundleAnalysis.summary;
    
    // Add recommendations based on bundle analysis
    if (bundleAnalysis.summary.totalSize > 5 * 1024 * 1024) { // > 5MB
      summary.recommendations.push('Consider reducing bundle size - current size is quite large');
    }
    
    if (bundleAnalysis.healthCheck.largeFiles > 0) {
      summary.recommendations.push('Review large files and consider code splitting or compression');
    }
  }

  // General recommendations
  summary.recommendations.push(
    'Run Lighthouse audit on deployed application',
    'Test application performance on slow networks',
    'Verify all images are optimized and using modern formats',
    'Check that Service Worker is functioning correctly',
    'Monitor Core Web Vitals in production'
  );

  log('📋 Audit completed successfully!', 'green');
  log(`📊 Results saved to: ${AUDIT_RESULTS_DIR}`, 'blue');
  
  if (summary.recommendations.length > 0) {
    logSubsection('Recommendations');
    summary.recommendations.forEach((rec, index) => {
      log(`${index + 1}. ${rec}`, 'yellow');
    });
  }

  // Save summary
  fs.writeFileSync(
    path.join(AUDIT_RESULTS_DIR, 'audit-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Generate HTML report
  const htmlReport = generateHtmlReport(summary);
  fs.writeFileSync(
    path.join(AUDIT_RESULTS_DIR, 'audit-report.html'),
    htmlReport
  );

  log(`\n🌐 HTML report generated: ${path.join(AUDIT_RESULTS_DIR, 'audit-report.html')}`, 'cyan');
}

function generateHtmlReport(summary) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Production Audit Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; }
        .section { margin-bottom: 30px; }
        .metric { display: inline-block; background: #f8f9fa; padding: 15px; margin: 10px; border-radius: 6px; min-width: 150px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #2c3e50; }
        .metric-label { font-size: 14px; color: #7f8c8d; margin-top: 5px; }
        .recommendation { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 10px 0; border-radius: 6px; }
        .status-good { color: #27ae60; }
        .status-warning { color: #f39c12; }
        .status-error { color: #e74c3c; }
        .timestamp { color: #7f8c8d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Production Audit Report</h1>
            <p class="timestamp">Generated on ${new Date(summary.timestamp).toLocaleString()}</p>
        </div>
        <div class="content">
            ${summary.bundleSize ? `
            <div class="section">
                <h2>📦 Bundle Analysis</h2>
                <div class="metric">
                    <div class="metric-value">${summary.bundleSize.totalSizeFormatted}</div>
                    <div class="metric-label">Total Size</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${summary.bundleSize.totalFiles}</div>
                    <div class="metric-label">Files</div>
                </div>
            </div>
            ` : ''}
            
            <div class="section">
                <h2>💡 Recommendations</h2>
                ${summary.recommendations.map(rec => `<div class="recommendation">• ${rec}</div>`).join('')}
            </div>
            
            <div class="section">
                <h2>📋 Next Steps</h2>
                <ol>
                    <li>Deploy to staging environment and run Lighthouse audit</li>
                    <li>Test on various devices and network conditions</li>
                    <li>Monitor performance metrics in production</li>
                    <li>Set up automated performance monitoring</li>
                </ol>
            </div>
        </div>
    </div>
</body>
</html>
  `;
}

// Main execution
function main() {
  log('🔍 Starting Production Audit...', 'bright');
  
  try {
    analyzeBundle();
    checkDependencies();
    checkBuildConfiguration();
    generateSummaryReport();
    
    log('\n✨ Audit completed successfully!', 'green');
  } catch (error) {
    log('\n❌ Audit failed:', 'red');
    console.error(error);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export {
  analyzeBundle,
  checkDependencies,
  checkBuildConfiguration,
  generateSummaryReport
};