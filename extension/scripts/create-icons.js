#!/usr/bin/env node

/**
 * Create PNG icons from source image
 * 
 * Uses sharp (npm package) to resize agent.png to required sizes
 * Generates: 16x16, 48x48, 128x128 PNG icons
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const ROOT_DIR = path.join(__dirname, '..');
const ICONS_DIR = path.join(ROOT_DIR, 'icons');
const SOURCE_IMAGE = path.join(ROOT_DIR, '../ui-new/public/agent.png');

const ICON_SIZES = [16, 48, 128];

/**
 * Check if ImageMagick is installed (fallback if sharp not available)
 */
async function checkImageMagick() {
  try {
    await execAsync('convert -version');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Create icons using ImageMagick (convert command)
 */
async function createIconsWithImageMagick() {
  console.log('🎨 Using ImageMagick to create icons...');
  
  for (const size of ICON_SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon-${size}.png`);
    const cmd = `convert "${SOURCE_IMAGE}" -resize ${size}x${size} "${outputPath}"`;
    
    try {
      await execAsync(cmd);
      console.log(`✅ Created ${size}x${size} icon`);
    } catch (error) {
      console.error(`❌ Failed to create ${size}x${size} icon:`, error.message);
      throw error;
    }
  }
}

/**
 * Create icons using sharp (npm package)
 */
async function createIconsWithSharp() {
  console.log('🎨 Using sharp to create icons...');
  
  let sharp;
  try {
    sharp = require('sharp');
  } catch (error) {
    console.error('❌ sharp not installed. Installing now...');
    await execAsync('npm install sharp --no-save', { cwd: ROOT_DIR });
    sharp = require('sharp');
  }
  
  for (const size of ICON_SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon-${size}.png`);
    
    try {
      await sharp(SOURCE_IMAGE)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Created ${size}x${size} icon`);
    } catch (error) {
      console.error(`❌ Failed to create ${size}x${size} icon:`, error.message);
      throw error;
    }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Creating extension icons...');
  console.log(`📍 Source image: ${SOURCE_IMAGE}`);
  console.log(`📁 Output directory: ${ICONS_DIR}`);
  console.log('');
  
  // Check if source image exists
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error(`❌ Source image not found: ${SOURCE_IMAGE}`);
    process.exit(1);
  }
  
  // Create icons directory
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }
  
  // Try sharp first, fallback to ImageMagick
  try {
    await createIconsWithSharp();
  } catch (error) {
    console.log('');
    console.log('⚠️  sharp failed, trying ImageMagick...');
    
    const hasImageMagick = await checkImageMagick();
    if (!hasImageMagick) {
      console.error('❌ Neither sharp nor ImageMagick available');
      console.error('   Install one of:');
      console.error('   - npm install sharp');
      console.error('   - sudo apt-get install imagemagick (Linux)');
      console.error('   - brew install imagemagick (macOS)');
      process.exit(1);
    }
    
    await createIconsWithImageMagick();
  }
  
  console.log('');
  console.log('✅ All icons created successfully!');
  console.log('');
  console.log('Icon files:');
  ICON_SIZES.forEach(size => {
    const filePath = path.join(ICONS_DIR, `icon-${size}.png`);
    const stats = fs.statSync(filePath);
    console.log(`  icon-${size}.png (${(stats.size / 1024).toFixed(1)} KB)`);
  });
}

// Run
main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
