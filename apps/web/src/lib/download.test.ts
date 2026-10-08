import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { zipResource } from './download.ts';

describe('zipResource', () => {
  it('legt alle Dateien unter einem Ordner mit dem Namen der Resource ab', () => {
    const zip = zipResource('my_prop', [
      { path: 'fxmanifest.lua', data: new TextEncoder().encode('fx_version') },
      { path: 'stream/my_prop.ydr', data: new Uint8Array([1, 2, 3]) },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['my_prop/fxmanifest.lua', 'my_prop/stream/my_prop.ydr']);
    expect([...files['my_prop/stream/my_prop.ydr']!]).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(files['my_prop/fxmanifest.lua'])).toBe('fx_version');
  });
});
