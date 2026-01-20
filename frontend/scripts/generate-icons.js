const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = typeof pngToIcoModule === 'function' ? pngToIcoModule : pngToIcoModule.default;

const OUTPUT_DIR = path.resolve(__dirname, '../public');
const SOURCE_IMAGE = path.resolve(OUTPUT_DIR, 'ico.png');

async function generate() {
  const exists = fs.existsSync(SOURCE_IMAGE);
  if (!exists) {
    throw new Error(`Source image not found at ${SOURCE_IMAGE}. Upload ico.png first.`);
  }

  const targets = [
    { size: 512, name: 'satellite-icon-512.png' },
    { size: 192, name: 'satellite-icon-192.png' },
    { size: 64, name: 'satellite-icon-64.png' },
    { size: 32, name: 'satellite-icon-32.png' },
    { size: 16, name: 'satellite-icon-16.png' },
  ];

  for (const target of targets) {
    const outPath = path.join(OUTPUT_DIR, target.name);
    await sharp(SOURCE_IMAGE)
      .resize(target.size, target.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outPath);
    console.log(`Generated ${target.name}`);
  }

  const icoBuffer = await pngToIco([
    path.join(OUTPUT_DIR, 'satellite-icon-64.png'),
    path.join(OUTPUT_DIR, 'satellite-icon-32.png'),
    path.join(OUTPUT_DIR, 'satellite-icon-16.png'),
  ]);
  await fsPromises.writeFile(path.join(OUTPUT_DIR, 'favicon-satellite.ico'), icoBuffer);
  await fsPromises.writeFile(path.join(OUTPUT_DIR, 'favicon.ico'), icoBuffer);
  console.log('Generated favicon-satellite.ico and favicon.ico');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
