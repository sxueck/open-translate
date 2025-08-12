/**
 * Professional icon generation script for Open Translate extension
 * This script generates Chrome Web Store compliant icons from source PNG files
 * using Sharp image processing library
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Chrome Web Store icon requirements
const ICON_SIZES = [16, 32, 48, 128];
const STORE_ICON_SIZES = [128]; // Additional sizes for Chrome Web Store

// Source icon file (128x128 PNG)
const SOURCE_ICON = path.join(__dirname, '..', '翻译.png');
const ICONS_DIR = path.join(__dirname, '..', 'assets', 'icons');

/**
 * Validate source icon file
 */
async function validateSourceIcon() {
  if (!fs.existsSync(SOURCE_ICON)) {
    throw new Error(`Source icon not found: ${SOURCE_ICON}`);
  }

  try {
    const metadata = await sharp(SOURCE_ICON).metadata();
    console.log(`Source icon: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    if (metadata.width !== 128 || metadata.height !== 128) {
      console.warn(`Warning: Source icon is ${metadata.width}x${metadata.height}, recommended 128x128`);
    }

    return metadata;
  } catch (error) {
    throw new Error(`Failed to read source icon: ${error.message}`);
  }
}

/**
 * Generate icon for specific size with high quality settings
 */
async function generateIcon(size) {
  const outputPath = path.join(ICONS_DIR, `icon${size}.png`);

  try {
    await sharp(SOURCE_ICON)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({
        quality: 100,
        compressionLevel: 6,
        adaptiveFiltering: true
      })
      .toFile(outputPath);

    console.log(`✓ Generated: icon${size}.png`);
    return outputPath;
  } catch (error) {
    console.error(`✗ Failed to generate icon${size}.png: ${error.message}`);
    throw error;
  }
}

/**
 * Create icons directory if it doesn't exist
 */
function ensureIconsDirectory() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    console.log(`Created icons directory: ${ICONS_DIR}`);
  }
}

/**
 * Main icon generation function
 */
async function generateAllIcons() {
  try {
    console.log('🎨 Starting icon generation for Chrome Web Store...\n');

    // Validate source
    await validateSourceIcon();

    // Ensure output directory exists
    ensureIconsDirectory();

    // Generate all required sizes
    console.log('Generating extension icons:');
    for (const size of ICON_SIZES) {
      await generateIcon(size);
    }

    console.log('\n✅ All icons generated successfully!');
    console.log('\nGenerated files:');
    ICON_SIZES.forEach(size => {
      const filePath = path.join(ICONS_DIR, `icon${size}.png`);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`  - icon${size}.png (${Math.round(stats.size / 1024)}KB)`);
      }
    });

    console.log('\n📋 Chrome Web Store Requirements:');
    console.log('✓ 16x16 - Extension icon in toolbar');
    console.log('✓ 32x32 - Extension icon in extension management page');
    console.log('✓ 48x48 - Extension icon in extension management page');
    console.log('✓ 128x128 - Extension icon in Chrome Web Store');

    console.log('\n🔍 Quality checks:');
    console.log('✓ High-quality Lanczos3 resampling');
    console.log('✓ Transparent background preserved');
    console.log('✓ PNG format with optimal compression');
    console.log('✓ Consistent aspect ratio maintained');

  } catch (error) {
    console.error(`\n❌ Icon generation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  generateAllIcons();
}

module.exports = {
  generateAllIcons,
  generateIcon,
  validateSourceIcon,
  ICON_SIZES
};
