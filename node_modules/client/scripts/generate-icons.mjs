import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const cream = '#fffdd0';

async function generate(input, outDir) {
  const sizes = [192, 512];
  await fs.promises.mkdir(outDir, { recursive: true });

  for (const size of sizes) {
    const outPath = path.join(outDir, `icon-${size}x${size}.png`);
    const canvas = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: cream
      }
    }).png().toBuffer();

    const icon = sharp(input).resize({
      width: Math.floor(size * 0.78),
      height: Math.floor(size * 0.78),
      fit: 'contain'
    });

    const composite = await sharp(canvas)
      .composite([
        { input: await icon.png().toBuffer(), gravity: 'center' }
      ])
      .png()
      .toBuffer();

    await fs.promises.writeFile(outPath, composite);
    console.log('Generated', outPath);
  }
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/generate-icons.mjs <input-image>');
  process.exit(1);
}

const outDir = path.resolve(process.cwd(), 'public');
await generate(path.resolve(process.cwd(), input), outDir);
