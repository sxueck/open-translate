/**
 * Setup vendor dependencies for Open Translate extension
 * Copies required third-party libraries to vendor directory
 */

const fs = require('fs');
const path = require('path');

console.log('Setting up vendor dependencies...\n');

// Create vendor directory structure
const vendorDir = path.join(__dirname, '..', 'vendor');
const readabilityDir = path.join(vendorDir, 'readability');

if (!fs.existsSync(vendorDir)) {
  fs.mkdirSync(vendorDir, { recursive: true });
  console.log('✓ Created vendor directory');
}

if (!fs.existsSync(readabilityDir)) {
  fs.mkdirSync(readabilityDir, { recursive: true });
  console.log('✓ Created vendor/readability directory');
}

// Copy Readability.js files
const readabilityFiles = [
  {
    src: 'node_modules/@mozilla/readability/Readability.js',
    dest: path.join(readabilityDir, 'Readability.js')
  },
  {
    src: 'node_modules/@mozilla/readability/Readability-readerable.js',
    dest: path.join(readabilityDir, 'Readability-readerable.js')
  }
];

console.log('\nCopying Readability.js files...');
let allCopied = true;

readabilityFiles.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ ${src} → ${dest}`);
  } else {
    console.log(`✗ ${src} - MISSING`);
    console.log('  Run "npm install" first to install dependencies');
    allCopied = false;
  }
});

if (allCopied) {
  console.log('\n' + '='.repeat(50));
  console.log('VENDOR SETUP COMPLETE');
  console.log('='.repeat(50));
  console.log('All vendor dependencies have been copied successfully.');
  console.log('The extension can now be loaded directly from source code.');
} else {
  console.log('\nVendor setup failed. Please install npm dependencies first.');
  process.exit(1);
}
