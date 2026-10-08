/**
 * Erzeugt die Würfel-Textur (Schachbrett, 64x64) mit unserem eigenen DDS-Schreiber
 * und das zugehörige YTD-XML (Eingabe für das lokale Vergleichswerkzeug).
 *
 * Aufruf: node make-cube-texture.ts <ausgabeordner>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeDdsBgra } from '../../packages/rage-formats/src/index.ts';

const outDir = resolve(process.argv[2] ?? 'ytd');
mkdirSync(outDir, { recursive: true });

const size = 64;
const data = new Uint8Array(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
    const c = on ? 0.85 : 0.15;
    const i = (y * size + x) * 4;
    data[i] = Math.round(c * 255);
    data[i + 1] = Math.round(c * 0.6 * 255);
    data[i + 2] = Math.round(0.2 * 255);
    data[i + 3] = 255;
  }
}

const textureName = 'forge_cube_diffuse';
writeFileSync(join(outDir, `${textureName}.dds`), writeDdsBgra({ width: size, height: size, data }));

// Feldnamen entsprechen dem CodeWalker-XML-Format für Texture Dictionaries.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TextureDictionary>
  <Item>
    <Name>${textureName}</Name>
    <Unk32 value="0" />
    <Usage>DIFFUSE</Usage>
    <UsageFlags>NOT_HALF</UsageFlags>
    <ExtraFlags value="0" />
    <Width value="${size}" />
    <Height value="${size}" />
    <MipLevels value="7" />
    <Format>D3DFMT_A8R8G8B8</Format>
    <FileName>${textureName}.dds</FileName>
  </Item>
</TextureDictionary>
`;
writeFileSync(join(outDir, 'forge_cube.ytd.xml'), xml);

console.log(`OK: ${join(outDir, textureName + '.dds')} und forge_cube.ytd.xml`);
