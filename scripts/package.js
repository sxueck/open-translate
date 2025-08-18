/**
 * Package script for Open Translate extension
 * Creates distributable packages (ZIP and CRX)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const formatArg = args.find(arg => arg.startsWith('--format='));
const format = formatArg ? formatArg.split('=')[1] : 'both';

console.log('Open Translate Extension Packager\n');

// Validate build first
console.log('Running build validation...');
try {
  execSync('node scripts/build.js', { stdio: 'inherit' });
} catch (error) {
  console.error('Build validation failed. Please fix errors before packaging.');
  process.exit(1);
}

// Read version from manifest
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

console.log(`\nPackaging Open Translate v${version}...`);

// Create dist directory
const distDir = path.join(__dirname, '..', 'dist');
const packageDir = path.join(distDir, 'extension');

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(packageDir, { recursive: true });

// Copy files to package directory
console.log('\nCopying files...');

// Copy manifest
fs.copyFileSync('manifest.json', path.join(packageDir, 'manifest.json'));
console.log('✓ manifest.json');

// Copy source directories
const srcDirs = ['src', 'assets', '_locales'];
srcDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    copyDirectory(dir, path.join(packageDir, dir));
    console.log(`✓ ${dir}/`);
  }
});

// Copy required npm dependencies
console.log('\nCopying npm dependencies...');
const nodeModulesDir = path.join(packageDir, 'node_modules', '@mozilla', 'readability');
fs.mkdirSync(nodeModulesDir, { recursive: true });

const readabilityFiles = [
  'node_modules/@mozilla/readability/Readability.js',
  'node_modules/@mozilla/readability/Readability-readerable.js'
];

readabilityFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const fileName = path.basename(file);
    fs.copyFileSync(file, path.join(nodeModulesDir, fileName));
    console.log(`✓ ${file}`);
  } else {
    console.error(`✗ ${file} - MISSING`);
    console.error('Run "npm install" to install dependencies');
    process.exit(1);
  }
});

// Generate PNG icons if needed
console.log('\nProcessing icons...');
try {
  generatePngIcons(packageDir);
} catch (error) {
  console.warn('Warning: Could not generate PNG icons. SVG icons will be used.');
  console.warn('For production, consider converting SVG to PNG manually.');
}

// Update manifest to use PNG icons if they exist
updateManifestIcons(packageDir);

// Clean up package directory
cleanPackageDirectory(packageDir);

// Create packages based on format
if (format === 'zip' || format === 'both') {
  createZipPackage(distDir, version);
}

if (format === 'crx' || format === 'both') {
  createCrxPackage(distDir, version);
}

console.log('\n' + '='.repeat(50));
console.log('PACKAGING COMPLETE');
console.log('='.repeat(50));
console.log(`Extension: Open Translate v${version}`);
console.log(`Output directory: ${distDir}`);

if (fs.existsSync(path.join(distDir, `open-translate-v${version}.zip`))) {
  console.log(`✓ ZIP package: open-translate-v${version}.zip`);
}

if (fs.existsSync(path.join(distDir, `open-translate-v${version}.crx`))) {
  console.log(`✓ CRX package: open-translate-v${version}.crx`);
}

console.log('\nInstallation instructions:');
console.log('1. For ZIP: Extract and load as unpacked extension in Chrome');
console.log('2. For CRX: Drag and drop into Chrome extensions page');

/**
 * Copy directory recursively
 */
function copyDirectory(src, dest) {
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
 * Generate PNG icons from SVG using available tools
 */
function generatePngIcons(packageDir) {
  const iconsDir = path.join(packageDir, 'assets', 'icons');
  const sizes = [16, 32, 48, 128];

  // Check if we have conversion tools available
  let hasInkscape = false;
  try {
    execSync('which inkscape', { stdio: 'ignore' });
    hasInkscape = true;
  } catch (error) {
    // Inkscape not available
  }

  if (!hasInkscape) {
    console.log('Inkscape not found. Keeping SVG icons.');
    return;
  }

  sizes.forEach(size => {
    const svgPath = path.join(iconsDir, `icon${size}.svg`);
    const pngPath = path.join(iconsDir, `icon${size}.png`);

    if (fs.existsSync(svgPath)) {
      try {
        execSync(`inkscape -w ${size} -h ${size} "${svgPath}" -o "${pngPath}"`, { stdio: 'ignore' });
        console.log(`✓ Generated icon${size}.png`);
      } catch (error) {
        console.warn(`Warning: Failed to generate icon${size}.png`);
      }
    }
  });
}

/**
 * Update manifest to use PNG icons if available
 */
function updateManifestIcons(packageDir) {
  const manifestPath = path.join(packageDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  const iconsDir = path.join(packageDir, 'assets', 'icons');
  const sizes = [16, 32, 48, 128];
  
  let hasPngIcons = false;
  sizes.forEach(size => {
    if (fs.existsSync(path.join(iconsDir, `icon${size}.png`))) {
      hasPngIcons = true;
    }
  });

  if (hasPngIcons) {
    // Update icon references to PNG
    if (manifest.icons) {
      Object.keys(manifest.icons).forEach(size => {
        manifest.icons[size] = manifest.icons[size].replace('.svg', '.png');
      });
    }

    if (manifest.action && manifest.action.default_icon) {
      Object.keys(manifest.action.default_icon).forEach(size => {
        manifest.action.default_icon[size] = manifest.action.default_icon[size].replace('.svg', '.png');
      });
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('✓ Updated manifest to use PNG icons');
  }
}

/**
 * Clean up package directory
 */
function cleanPackageDirectory(packageDir) {
  // Remove development files
  const filesToRemove = [
    '**/*.md',
    '**/.DS_Store',
    '**/Thumbs.db',
    '**/*.tmp'
  ];

  // Simple cleanup - remove common development files
  const removeFiles = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        removeFiles(fullPath);
      } else if (entry.name.endsWith('.md') || 
                 entry.name === '.DS_Store' || 
                 entry.name === 'Thumbs.db' ||
                 entry.name.endsWith('.tmp')) {
        fs.unlinkSync(fullPath);
      }
    }
  };

  removeFiles(packageDir);
}

/**
 * Create ZIP package
 */
function createZipPackage(distDir, version) {
  console.log('\nCreating ZIP package...');
  
  const zipName = `open-translate-v${version}.zip`;
  const zipPath = path.join(distDir, zipName);
  
  try {
    // Use system zip command
    execSync(`cd "${path.join(distDir, 'extension')}" && zip -r "../${zipName}" .`, { stdio: 'ignore' });
    console.log(`✓ Created ${zipName}`);
  } catch (error) {
    console.error('Failed to create ZIP package:', error.message);
  }
}

/**
 * Create CRX package
 */
function createCrxPackage(distDir, version) {
  console.log('\nCreating CRX package...');
  
  const crxName = `open-translate-v${version}.crx`;
  const keyPath = path.join(distDir, 'extension.pem');
  
  // Generate private key if it doesn't exist
  if (!fs.existsSync(keyPath)) {
    try {
      execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'ignore' });
      console.log('✓ Generated private key');
    } catch (error) {
      console.error('Failed to generate private key:', error.message);
      return;
    }
  }

  // Check if Chrome is available
  let chromeCmd = null;
  const chromeCmds = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];

  for (const cmd of chromeCmds) {
    try {
      execSync(`which "${cmd}"`, { stdio: 'ignore' });
      chromeCmd = cmd;
      break;
    } catch (error) {
      // Command not found, try next
    }
  }

  if (!chromeCmd) {
    console.warn('Chrome not found. Cannot create CRX package.');
    console.warn('Please install Chrome or use the ZIP package.');
    return;
  }

  try {
    const extensionDir = path.join(distDir, 'extension');
    execSync(`"${chromeCmd}" --headless --disable-gpu --pack-extension="${extensionDir}" --pack-extension-key="${keyPath}"`, { stdio: 'ignore' });
    
    // Move the generated CRX
    const generatedCrx = `${extensionDir}.crx`;
    const finalCrx = path.join(distDir, crxName);
    
    if (fs.existsSync(generatedCrx)) {
      fs.renameSync(generatedCrx, finalCrx);
      console.log(`✓ Created ${crxName}`);
    } else {
      console.error('CRX file was not generated');
    }
  } catch (error) {
    console.error('Failed to create CRX package:', error.message);
  }
}

module.exports = {
  copyDirectory,
  generatePngIcons,
  updateManifestIcons,
  cleanPackageDirectory
};
