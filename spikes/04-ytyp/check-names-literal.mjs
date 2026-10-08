function literal(input) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h + (input.charCodeAt(i) & 0xff)) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; h = (h + (h << 15)) >>> 0; return h >>> 0;
}
const expect = {
  lodDist: 0xbf74dfa7, flags: 0x67d26872, specialAttribute: 0x6c1523e4, bbMin: 0xd9ef8236, bbMax: 0xe78aa618,
  bsCentre: 0xd61872ff, bsRadius: 0x82e8c5de, hdTextureDist: 0xad5d5b4c, name: 0xe6e17f14, textureDictionary: 0x75d215a1,
  clipDictionary: 0x19471791, drawableDictionary: 0xfc1fb6fb, physicsDictionary: 0xd3c717fc, assetType: 0x069004b2, assetName: 0x9a77c7c5,
  extensions: 0xf17e7f28, archetypes: 0x018a3b1b, dependencies: 0x3c6f8844, compositeEntityTypes: 0x65e9d4eb,
  CMapTypes: 0xd98bb561, CBaseArchetypeDef: 0x82d6fc83,
};
let ok = 0;
for (const [n, h] of Object.entries(expect)) { const m = literal(n) === h; if (m) ok++; console.log(m ? 'OK    ' : 'ANDERS', n.padEnd(22), '0x' + literal(n).toString(16).padStart(8, '0'), 'erwartet 0x' + h.toString(16).padStart(8, '0')); }
console.log(ok + ' von ' + Object.keys(expect).length + ' stimmen');
