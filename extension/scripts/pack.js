#!/usr/bin/env node

/**
 * Pack script for Research Agent Extension
 * 
 * Creates a .zip file for distribution to Chrome Web Store
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_FILE = path.join(ROOT_DIR, 'research-agent-extension.zip');

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  console.error('❌ dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

// Remove existing zip file
if (fs.existsSync(OUTPUT_FILE)) {
  fs.unlinkSync(OUTPUT_FILE);
}

console.log('📦 Creating extension package...');

// Create write stream
const output = fs.createWriteStream(OUTPUT_FILE);
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Listen for completion
output.on('close', () => {
  const size = (archive.pointer() / 1024).toFixed(2);
  console.log('✅ Package created successfully!');
  console.log(`📁 File: ${OUTPUT_FILE}`);
  console.log(`💾 Size: ${size} KB`);
  console.log('');
  console.log('Ready to upload to:');
  console.log('  - Chrome Web Store: https://chrome.google.com/webstore/devconsole');
  console.log('  - Firefox Add-ons: https://addons.mozilla.org/developers/');
  console.log('  - Edge Add-ons: https://partner.microsoft.com/dashboard');
});

// Handle errors
archive.on('error', (err) => {
  console.error('❌ Error creating package:', err);
  process.exit(1);
});

// Pipe archive data to the file
archive.pipe(output);

// Add dist directory contents to the archive
archive.directory(DIST_DIR, false);

// Finalize the archive
archive.finalize();
