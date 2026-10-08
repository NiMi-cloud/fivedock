import { readYtd } from '@toolkit/rage-formats';
import type { YtdTexture } from '@toolkit/rage-formats';
import type { PackFiles } from '@toolkit/forge-core';

export interface PackTexture {
  texture: YtdTexture;
  /** Pfad der .ytd-Datei im Paket, in der die Textur zuerst steht (die normale vor der Hochdetail-Datei). */
  path: string;
  /**
   * Alle .ytd-Dateien des Pakets, in denen eine Textur dieses Namens steht. Fahrzeuge haben oft zwei: die normale und die
   * Hochdetail-Datei (`+hi`). Wer eine Textur ersetzt, muss sie in allen ersetzen, sonst gewinnt aus der Nähe die alte.
   */
  allPaths: string[];
}

/**
 * Liest alle Texturen der .ytd-Dateien eines Fahrzeugpakets in eine Tabelle (Name klein geschrieben).
 * Bei doppelten Namen gewinnt die normale Datei vor der Hochdetail-Datei (`+hi`). Verschlüsselte oder
 * beschädigte Dateien werden übersprungen.
 */
export function readPackTextures(files: PackFiles): Map<string, PackTexture> {
  const paths = Object.keys(files)
    .filter((p) => p.toLowerCase().endsWith('.ytd'))
    .sort((a, b) => Number(/\+hi\./i.test(a)) - Number(/\+hi\./i.test(b)) || a.localeCompare(b));
  const map = new Map<string, PackTexture>();
  for (const path of paths) {
    try {
      for (const texture of readYtd(files[path]!)) {
        const key = texture.name.toLowerCase();
        const known = map.get(key);
        if (known) known.allPaths.push(path);
        else map.set(key, { texture, path, allPaths: [path] });
      }
    } catch {
      // Datei nicht lesbar: ohne ihre Texturen weitermachen.
    }
  }
  return map;
}
