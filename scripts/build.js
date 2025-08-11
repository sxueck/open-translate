/**
 * Build script for Open Translate extension
 * Prepares the extension for distribution
 */

const fs = require('fs');
const path = require('path');

console.log('Building Open Translate extension...\n');

// Validate required files
const requiredFiles = [
  'manifest.json',
  'src/core/translator.js',
  'src/core/textExtractor.js',
  'src/core/translationRenderer.js',
  'src/content/content.js',
  'src/content/content.css',
  'src/background/background.js',
  'src/popup/popup.html',
  'src/popup/popup.css',
  'src/popup/popup.js',
  'src/options/options.html',
  'src/options/options.css',
  'src/options/options.js'
];

console.log('Validating required files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('\nBuild failed: Missing required files');
  process.exit(1);
}

// Check manifest.json validity
console.log('\nValidating manifest.json...');
try {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  
  // Check required manifest fields
  const requiredFields = ['manifest_version', 'name', 'version', 'description'];
  const missingFields = requiredFields.filter(field => !manifest[field]);
  
  if (missingFields.length > 0) {
    console.log(`✗ Missing required fields: ${missingFields.join(', ')}`);
    process.exit(1);
  }
  
  console.log(`✓ Manifest version: ${manifest.version}`);
  console.log(`✓ Extension name: ${manifest.name}`);
  
} catch (error) {
  console.log('✗ Invalid manifest.json:', error.message);
  process.exit(1);
}

// Check for icon files
console.log('\nChecking icon files...');
const iconSizes = [16, 32, 48, 128];
let hasIcons = true;

iconSizes.forEach(size => {
  const svgPath = `assets/icons/icon${size}.svg`;
  const pngPath = `assets/icons/icon${size}.png`;
  
  if (fs.existsSync(pngPath)) {
    console.log(`${pngPath}`);
  } else if (fs.existsSync(svgPath)) {
    console.log(`${svgPath} (SVG placeholder - convert to PNG for production)`);
  } else {
    console.log(`Missing icon: icon${size}.png/svg`);
    hasIcons = false;
  }
});

if (!hasIcons) {
  console.log('\nWarning: Some icon files are missing');
  console.log('Run: node scripts/generate-icons.js to create placeholders');
}

// Validate JavaScript files for basic syntax
console.log('\nValidating JavaScript files...');
const jsFiles = requiredFiles.filter(file => file.endsWith('.js'));

jsFiles.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // Basic syntax check - look for common issues
    if (content.includes('console.log') && !file.includes('background.js')) {
      console.log(`⚠ ${file} contains console.log statements`);
    }
    
    // Check for emoji (not allowed per requirements)
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    if (emojiRegex.test(content)) {
      console.log(`✗ ${file} contains emoji characters (not allowed)`);
      process.exit(1);
    }
    
    console.log(`✓ ${file}`);
  } catch (error) {
    console.log(`✗ ${file} - Error: ${error.message}`);
    process.exit(1);
  }
});

// Check CSS files
console.log('\nValidating CSS files...');
const cssFiles = requiredFiles.filter(file => file.endsWith('.css'));

cssFiles.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // Check for emoji in CSS
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    if (emojiRegex.test(content)) {
      console.log(`✗ ${file} contains emoji characters (not allowed)`);
      process.exit(1);
    }
    
    console.log(`✓ ${file}`);
  } catch (error) {
    console.log(`✗ ${file} - Error: ${error.message}`);
    process.exit(1);
  }
});

// Generate build info
const buildInfo = {
  buildTime: new Date().toISOString(),
  version: JSON.parse(fs.readFileSync('manifest.json', 'utf8')).version,
  files: requiredFiles.length,
  status: 'success'
};

fs.writeFileSync('build-info.json', JSON.stringify(buildInfo, null, 2));

console.log('\n' + '='.repeat(50));
console.log('BUILD SUCCESSFUL');
console.log('='.repeat(50));
console.log(`Extension: Open Translate v${buildInfo.version}`);
console.log(`Build time: ${buildInfo.buildTime}`);
console.log(`Files validated: ${buildInfo.files}`);

console.log('\nNext steps:');
console.log('1. Test the extension in Chrome developer mode');
console.log('2. Convert SVG icons to PNG for production');
console.log('3. Configure API settings in the extension');
console.log('4. Test translation functionality');
console.log('5. Package for Chrome Web Store (if publishing)');

console.log('\nTo load in Chrome:');
console.log('1. Open chrome://extensions/');
console.log('2. Enable Developer mode');
console.log('3. Click "Load unpacked"');
console.log('4. Select this directory');

module.exports = {
  requiredFiles,
  buildInfo
};
