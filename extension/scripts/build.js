#!/usr/bin/env node

/**
 * Build script for Research Agent Extension
 * 
 * Copies files from src/ and public/ to dist/ for distribution
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ICONS_DIR = path.join(ROOT_DIR, 'icons');

// Clean dist directory
console.log('🧹 Cleaning dist directory...');
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copy manifest.json
console.log('📋 Copying manifest.json...');
fs.copyFileSync(
  path.join(ROOT_DIR, 'manifest.json'),
  path.join(DIST_DIR, 'manifest.json')
);

// Copy public files (HTML, CSS)
console.log('📄 Copying public files...');
copyDirectory(PUBLIC_DIR, DIST_DIR);

// Copy source files (JS)
console.log('📦 Copying source files...');
copyDirectory(SRC_DIR, DIST_DIR);

// Copy icons
console.log('🎨 Copying icons...');
const distIconsDir = path.join(DIST_DIR, 'icons');
fs.mkdirSync(distIconsDir, { recursive: true });
if (fs.existsSync(ICONS_DIR) && fs.readdirSync(ICONS_DIR).length > 0) {
  copyDirectory(ICONS_DIR, distIconsDir);
  console.log('✅ Icons copied successfully');
} else {
  console.warn('⚠️  Icons directory not found or empty - run "npm run icons" first');
  console.warn('   Creating placeholder icons...');
  createPlaceholderIcons(distIconsDir);
}

console.log('✅ Build complete! Extension is ready in dist/');
console.log('');
console.log('Next steps:');
console.log('  1. Open Chrome and go to chrome://extensions/');
console.log('  2. Enable "Developer mode"');
console.log('  3. Click "Load unpacked"');
console.log('  4. Select the dist/ folder');

/**
 * Copy directory recursively
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source directory not found: ${src}`);
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Create placeholder icons (simple colored squares)
 */
function createPlaceholderIcons(iconDir) {
  // Create simple SVG icons as placeholders
  const sizes = [16, 48, 128];
  
  sizes.forEach(size => {
    const svg = `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#3b82f6"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size/3}" fill="white" stroke="white" stroke-width="${size/16}"/>
  <path d="M ${size*0.7} ${size*0.7} L ${size*0.85} ${size*0.85}" stroke="white" stroke-width="${size/8}" stroke-linecap="round"/>
</svg>`.trim();
    
    fs.writeFileSync(path.join(iconDir, `icon-${size}.png.svg`), svg);
  });
  
  console.log('📌 Created placeholder SVG icons (replace with PNG icons for production)');
}
