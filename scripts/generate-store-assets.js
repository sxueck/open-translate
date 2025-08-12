/**
 * Chrome Web Store promotional assets generation script
 * Generates additional images required for Chrome Web Store listing
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Chrome Web Store promotional image requirements
const STORE_ASSETS = {
  // Small promotional tile (440x280)
  smallTile: { width: 440, height: 280, name: 'store-small-tile.png' },
  // Large promotional tile (920x680) 
  largeTile: { width: 920, height: 680, name: 'store-large-tile.png' },
  // Marquee promotional tile (1400x560)
  marquee: { width: 1400, height: 560, name: 'store-marquee.png' }
};

const SOURCE_ICON = path.resolve(__dirname, '..', '翻译.png');
const STORE_ASSETS_DIR = path.join(__dirname, '..', 'assets', 'store');

/**
 * Create store assets directory
 */
function ensureStoreAssetsDirectory() {
  if (!fs.existsSync(STORE_ASSETS_DIR)) {
    fs.mkdirSync(STORE_ASSETS_DIR, { recursive: true });
    console.log(`Created store assets directory: ${STORE_ASSETS_DIR}`);
  }
}

/**
 * Generate promotional tile with icon and text
 */
async function generatePromotionalTile(config) {
  const { width, height, name } = config;
  const outputPath = path.join(STORE_ASSETS_DIR, name);
  
  // Calculate icon size (about 1/3 of the height)
  const iconSize = Math.floor(height * 0.3);
  
  try {
    // Create a background with gradient
    const background = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 25, g: 118, b: 210, alpha: 1 } // Material Blue
      }
    }).png();

    // Resize the source icon
    const resizedIcon = await sharp(SOURCE_ICON)
      .resize(iconSize, iconSize, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png();

    // Create SVG overlay with text
    const textSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1976d2;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1565c0;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#bg)"/>
        <text x="${width/2}" y="${height * 0.75}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="${Math.floor(height * 0.08)}" 
              font-weight="bold">Open Translate</text>
        <text x="${width/2}" y="${height * 0.85}" text-anchor="middle" 
              fill="rgba(255,255,255,0.9)" font-family="Arial, sans-serif" 
              font-size="${Math.floor(height * 0.04)}">
              Powerful web page translation extension
        </text>
      </svg>
    `;

    // Composite the background, icon, and text
    await sharp(Buffer.from(textSvg))
      .composite([
        {
          input: await resizedIcon.toBuffer(),
          left: Math.floor((width - iconSize) / 2),
          top: Math.floor(height * 0.15)
        }
      ])
      .png({
        quality: 100,
        compressionLevel: 6
      })
      .toFile(outputPath);

    console.log(`✓ Generated: ${name} (${width}x${height})`);
    return outputPath;
  } catch (error) {
    console.error(`✗ Failed to generate ${name}: ${error.message}`);
    throw error;
  }
}

/**
 * Generate all Chrome Web Store promotional assets
 */
async function generateAllStoreAssets() {
  try {
    console.log('🏪 Generating Chrome Web Store promotional assets...\n');
    
    // Ensure output directory exists
    ensureStoreAssetsDirectory();
    
    // Generate all promotional tiles
    for (const [key, config] of Object.entries(STORE_ASSETS)) {
      await generatePromotionalTile(config);
    }
    
    console.log('\n✅ All store assets generated successfully!');
    console.log('\nGenerated promotional images:');
    
    Object.values(STORE_ASSETS).forEach(config => {
      const filePath = path.join(STORE_ASSETS_DIR, config.name);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`  - ${config.name} (${config.width}x${config.height}, ${Math.round(stats.size / 1024)}KB)`);
      }
    });
    
    console.log('\n📋 Chrome Web Store Asset Requirements:');
    console.log('✓ Small promotional tile (440x280) - Optional');
    console.log('✓ Large promotional tile (920x680) - Optional');  
    console.log('✓ Marquee promotional tile (1400x560) - Optional');
    console.log('\n💡 These promotional images can be uploaded to Chrome Web Store');
    console.log('   to enhance your extension\'s listing appearance.');
    
  } catch (error) {
    console.error(`\n❌ Store assets generation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  generateAllStoreAssets();
}

module.exports = {
  generateAllStoreAssets,
  generatePromotionalTile,
  STORE_ASSETS
};
