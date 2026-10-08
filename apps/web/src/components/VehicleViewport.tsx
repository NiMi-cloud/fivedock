import { sequenceOn } from '@toolkit/forge-core';
import type { PartCategory, VehiclePart } from '@toolkit/forge-core';
import type { Yft } from '@toolkit/rage-formats';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ViewPreset = 'front' | 'rear' | 'side' | 'top' | 'iso';

/** Befehl an die Kamera. `nonce` ändert sich bei jedem Klick, damit derselbe Befehl erneut wirkt. */
export interface CameraCommand {
  kind: 'preset' | 'focus';
  preset?: ViewPreset;
  /** Teile, auf die die Kamera zeigen soll. */
  partIds?: string[];
  nonce: number;
}

/** Livery-Bild, das über den Lack der angegebenen Teile gelegt wird. */
export interface LiveryOverlay {
  image: HTMLCanvasElement;
  /** UV-Satz, auf dem die Livery liegt (UV1 bei den meisten Fahrzeugen). */
  uvSet: number;
  partIds: ReadonlySet<string>;
}

/** Diffuse-Textur je Shader (Index in `Yft.shaders`) für Teile, die keinen Lack tragen: Innenraum, Licht, Reifen, Anbauteile. */
export type DiffuseImages = ReadonlyMap<number, HTMLCanvasElement>;

/** Ein Licht der Sirene an der Lage seines Knochens. `sequence` ist das Blinkmuster (32 Bit, 1 = an). */
export interface SirenMarker {
  id: string;
  position: [number, number, number];
  /** "#rrggbb" */
  color: string;
  sequence: number;
}

/** Ein Anbauteil, das noch nicht in der Datei steht, als einfarbiges Netz in der Vorschau. */
export interface ExtraMesh {
  id: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: ArrayLike<number>;
  /** "#rrggbb" */
  color: string;
  /** Leuchtet schwach (Linsen). */
  glow?: boolean;
  /** Im Bild hervorgehoben (das gerade bearbeitete Teil). */
  highlight?: boolean;
  /** Texturkoordinaten (2 Werte je Eckpunkt) und Textur, wenn das Netz seine eigene Textur zeigen soll. */
  uvs?: Float32Array;
  image?: HTMLCanvasElement;
}

interface Props {
  yft: Yft | null;
  parts: VehiclePart[];
  /** Teile, die gezeichnet werden. */
  visible: ReadonlySet<string>;
  /** Teile der aktuellen Auswahl. */
  selected: ReadonlySet<string>;
  wireframe: boolean;
  /** Lackfarbe als "#rrggbb", sichtbar überall dort, wo die Livery durchsichtig ist. */
  paintColor: string;
  livery: LiveryOverlay | null;
  /** Texturen für nicht lackierte Teile, oder null für einfarbige Teile. */
  diffuse: DiffuseImages | null;
  /** Sirenenlichter als leuchtende Punkte, mit Takt (BPM) und Schalter für die Blink-Vorschau. */
  markers?: SirenMarker[];
  markerBpm?: number;
  markersPlaying?: boolean;
  /** Neue Anbauteile als Vorschau. */
  extras?: ExtraMesh[];
  command: CameraCommand | null;
  /** Wird mit der Teil-ID aufgerufen, wenn ein Teil angeklickt wurde, sonst mit null. */
  onPick: (partId: string | null) => void;
  noWebGlText: string;
}

interface Scene3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  render: () => void;
  meshes: Map<string, THREE.Mesh>;
  /** Livery-Schicht je Teil, liegt über dem Lack und wird beim Anklicken ignoriert. */
  overlays: Map<string, THREE.Mesh>;
  /** Materialien mit Textur, je Shader. Dazugehörige Zeichenflächen siehe `diffuse`. */
  textured: Map<number, THREE.MeshStandardMaterial>;
  baseMaterials: Record<PartCategory, THREE.MeshStandardMaterial>;
  selectedMaterials: Record<PartCategory, THREE.MeshStandardMaterial>;
  hoverMaterial: THREE.MeshStandardMaterial;
  radius: number;
  center: THREE.Vector3;
}

const AMBER = 0xe8a33d;

function makeMaterials() {
  const base: Record<PartCategory, THREE.MeshStandardMaterial> = {
    paint: new THREE.MeshStandardMaterial({ color: 0xc7ccd6, metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x6fa8d8, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    light: new THREE.MeshStandardMaterial({ color: 0xf2c46a, metalness: 0, roughness: 0.4, emissive: 0x6b4a10, side: THREE.DoubleSide }),
    tire: new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0, roughness: 0.9, side: THREE.DoubleSide }),
    other: new THREE.MeshStandardMaterial({ color: 0x8a909c, metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide }),
  };
  const selected = {} as Record<PartCategory, THREE.MeshStandardMaterial>;
  (Object.keys(base) as PartCategory[]).forEach((k) => {
    const m = base[k].clone();
    m.color.setHex(AMBER);
    m.emissive.setHex(0x7a4a00);
    m.metalness = 0.2;
    m.opacity = k === 'glass' ? 0.7 : 1;
    selected[k] = m;
  });
  const hover = new THREE.MeshStandardMaterial({ color: 0xf6d38f, emissive: 0x4a3200, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });
  return { base, selected, hover };
}

/**
 * Abstand der Kamera von der Mitte des Kastens, bei dem der Kasten aus Blickrichtung `dir` (von der Mitte zur Kamera)
 * ins Bild passt. Anders als eine Kugel nutzt das die Form: ein langes, flaches Auto füllt in der Seitenansicht die Breite.
 */
function fitDistance(box: THREE.Box3, dir: THREE.Vector3, camera: THREE.PerspectiveCamera): number {
  const up = Math.abs(dir.z) > 0.98 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const trueUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  const center = box.getCenter(new THREE.Vector3());
  const vTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const hTan = vTan * camera.aspect;
  let dist = 0;
  const corner = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).sub(center);
        const depth = corner.dot(dir); // zur Kamera hin positiv
        dist = Math.max(dist, depth + Math.abs(corner.dot(right)) / hTan, depth + Math.abs(corner.dot(trueUp)) / vTan);
      }
    }
  }
  return dist * 1.06;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
  group.clear();
}

export function VehicleViewport({ yft, parts, visible, selected, wireframe, paintColor, livery, diffuse, markers, markerBpm = 650, markersPlaying = false, extras, command, onPick, noWebGlText }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<Scene3D | null>(null);
  const hovered = useRef<string | null>(null);
  const latest = useRef({ selected, visible, onPick });
  latest.current = { selected, visible, onPick };
  const [error, setError] = useState<string | null>(null);

  // Szene einmalig aufbauen.
  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError(noWebGlText);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x14161b, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
    camera.up.set(0, 0, 1); // GTA: Z ist oben, Y zeigt nach vorn
    camera.position.set(-5, 6, 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3d44, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-4, 6, 9);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb4ff, 0.8);
    fill.position.set(6, -5, 3);
    scene.add(fill);

    const grid = new THREE.GridHelper(40, 40, 0x555a66, 0x2b2f38);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const content = new THREE.Group();
    scene.add(content);

    const mats = makeMaterials();
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const state: Scene3D = {
      renderer,
      scene,
      camera,
      controls,
      content,
      render,
      meshes: new Map(),
      overlays: new Map(),
      textured: new Map(),
      baseMaterials: mats.base,
      selectedMaterials: mats.selected,
      hoverMaterial: mats.hover,
      radius: 3,
      center: new THREE.Vector3(),
    };
    ctx.current = state;

    // Anklicken und Überfahren: das vorderste Teil unter dem Zeiger, Glas nur wenn nichts dahinter liegt.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event: PointerEvent): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
      raycaster.setFromCamera(pointer, camera);
      const targets = [...state.meshes.values()].filter((m) => m.visible);
      const hits = raycaster.intersectObjects(targets, false);
      const solid = hits.find((h) => (h.object as THREE.Mesh).userData.category !== 'glass');
      return ((solid ?? hits[0])?.object as THREE.Mesh | undefined)?.userData.partId ?? null;
    };

    const applyMaterial = (id: string) => {
      const mesh = state.meshes.get(id);
      if (!mesh) return;
      const category = mesh.userData.category as PartCategory;
      mesh.material = latest.current.selected.has(id)
        ? state.selectedMaterials[category]
        : hovered.current === id
          ? state.hoverMaterial
          : ((mesh.userData.textured as THREE.Material | undefined) ?? state.baseMaterials[category]);
    };

    let frame = 0;
    let lastEvent: PointerEvent | null = null;
    const onMove = (event: PointerEvent) => {
      if (event.buttons !== 0) return; // beim Ziehen nicht prüfen
      lastEvent = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!lastEvent) return;
        const id = pick(lastEvent);
        if (id === hovered.current) return;
        const before = hovered.current;
        hovered.current = id;
        if (before) applyMaterial(before);
        if (id) applyMaterial(id);
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
        render();
      });
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      if (!down || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved < 5) latest.current.onPick(pick(event));
    };
    const dom = renderer.domElement;
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    dom.style.cursor = 'grab';

    return () => {
      cancelAnimationFrame(frame);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
      observer.disconnect();
      controls.dispose();
      disposeGroup(content);
      Object.values(mats.base).forEach((m) => m.dispose());
      Object.values(mats.selected).forEach((m) => m.dispose());
      mats.hover.dispose();
      grid.geometry.dispose();
      renderer.dispose();
      dom.remove();
      ctx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fahrzeug aufbauen: je Geometrie gemeinsame Puffer, je Teil eine eigene Indexliste.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    disposeGroup(c.content);
    c.meshes.clear();
    c.overlays.clear();
    if (!yft) {
      c.render();
      return;
    }

    const shared = yft.geometries.map((g) => {
      const base = new THREE.BufferGeometry();
      base.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
      // Texturkoordinaten der ersten vier Sätze (three.js kennt uv, uv1, uv2, uv3).
      for (let set = 0; set < 4; set++) {
        const uv = g.uvs[set];
        if (uv) base.setAttribute(set === 0 ? 'uv' : `uv${set}`, new THREE.BufferAttribute(uv, 2));
      }
      if (g.normals) {
        base.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
      } else {
        base.setIndex(new THREE.BufferAttribute(g.indices, 1));
        base.computeVertexNormals();
      }
      return base;
    });
    for (const part of parts) {
      const base = shared[part.geometry]!;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', base.getAttribute('position'));
      geo.setAttribute('normal', base.getAttribute('normal'));
      for (const name of ['uv', 'uv1', 'uv2', 'uv3']) {
        const attribute = base.getAttribute(name);
        if (attribute) geo.setAttribute(name, attribute);
      }
      geo.setIndex(new THREE.BufferAttribute(part.indices, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, c.baseMaterials[part.category]);
      mesh.userData = { partId: part.id, category: part.category, shader: part.shader };
      c.content.add(mesh);
      c.meshes.set(part.id, mesh);
    }

    const min = new THREE.Vector3(...yft.boundsMin);
    const max = new THREE.Vector3(...yft.boundsMax);
    c.center.copy(min).add(max).multiplyScalar(0.5);
    c.radius = Math.max(min.distanceTo(max) / 2, 0.5);
    const dist = (c.radius / Math.sin(THREE.MathUtils.degToRad(c.camera.fov / 2))) * 1.05;
    c.controls.target.copy(c.center);
    c.camera.position.set(c.center.x - dist * 0.7, c.center.y + dist * 0.6, c.center.z + dist * 0.35);
    c.camera.near = Math.max(dist / 500, 0.01);
    c.camera.far = dist * 40;
    c.camera.updateProjectionMatrix();
    c.controls.update();
    c.render();
  }, [yft, parts]);

  // Sichtbarkeit, Auswahl und Drahtgitter.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    for (const [id, mesh] of c.meshes) {
      mesh.visible = visible.has(id);
      const category = mesh.userData.category as PartCategory;
      mesh.material = selected.has(id) ? c.selectedMaterials[category] : ((mesh.userData.textured as THREE.Material | undefined) ?? c.baseMaterials[category]);
      const overlay = c.overlays.get(id);
      if (overlay) overlay.visible = mesh.visible && !selected.has(id);
    }
    for (const m of Object.values(c.baseMaterials)) m.wireframe = wireframe;
    for (const m of c.textured.values()) m.wireframe = wireframe;
    for (const m of Object.values(c.selectedMaterials)) m.wireframe = wireframe;
    c.render();
  }, [visible, selected, wireframe, yft, parts, livery, diffuse]);

  // Sirenenlichter: leuchtende Punkte an den Knochen, optional im Takt des Blinkmusters.
  useEffect(() => {
    const c = ctx.current;
    if (!c || !markers || markers.length === 0) return;
    const scale = Math.max(0.5, c.radius / 3);
    const items = markers.map((m) => {
      const color = new THREE.Color(m.color);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.11 * scale, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false }));
      core.renderOrder = 10;
      halo.renderOrder = 9;
      const group = new THREE.Group();
      group.add(halo, core);
      group.position.set(...m.position);
      c.scene.add(group);
      return { group, core, halo, color, sequence: m.sequence };
    });
    const show = (item: (typeof items)[number], on: boolean) => {
      (item.core.material as THREE.MeshBasicMaterial).color.copy(on ? item.color : new THREE.Color(0x2a2c31));
      item.halo.visible = on;
    };
    items.forEach((item) => show(item, true));
    let timer = 0;
    if (markersPlaying) {
      let step = 0;
      timer = window.setInterval(() => {
        step++;
        for (const item of items) show(item, sequenceOn(item.sequence, step));
        c.render();
      }, Math.max(30, 60000 / Math.max(30, markerBpm)));
    }
    c.render();
    return () => {
      window.clearInterval(timer);
      for (const item of items) {
        c.scene.remove(item.group);
        item.core.geometry.dispose();
        item.halo.geometry.dispose();
        (item.core.material as THREE.Material).dispose();
        (item.halo.material as THREE.Material).dispose();
      }
      c.render();
    };
  }, [markers, markerBpm, markersPlaying]);

  // Neue Anbauteile: einfache Netze, nicht anklickbar.
  useEffect(() => {
    const c = ctx.current;
    if (!c || !extras || extras.length === 0) return;
    const made = extras.map((e) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(e.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(e.normals, 3));
      geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(e.indices), 1));
      let texture: THREE.CanvasTexture | null = null;
      if (e.uvs && e.image) {
        geo.setAttribute('uv', new THREE.BufferAttribute(e.uvs, 2));
        texture = new THREE.CanvasTexture(e.image);
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
      }
      const material = new THREE.MeshStandardMaterial({
        color: texture ? '#ffffff' : e.color,
        map: texture,
        metalness: 0.2,
        roughness: 0.45,
        side: THREE.DoubleSide,
        emissive: e.highlight ? 0x7a4a00 : e.glow ? new THREE.Color(e.color).multiplyScalar(0.35) : 0x000000,
      });
      const mesh = new THREE.Mesh(geo, material);
      c.scene.add(mesh);
      return { mesh, geo, material, texture };
    });
    c.render();
    return () => {
      for (const m of made) {
        c.scene.remove(m.mesh);
        m.geo.dispose();
        m.material.dispose();
        m.texture?.dispose();
      }
      c.render();
    };
  }, [extras]);

  // Lackfarbe.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    c.baseMaterials.paint.color.set(paintColor);
    c.render();
  }, [paintColor]);

  // Texturen für Teile ohne Lack. Zeichenflächen kommen fertig dekodiert von der Seite, hier entstehen nur die Materialien.
  useEffect(() => {
    const c = ctx.current;
    if (!c || !yft || !diffuse) return;
    const made: Array<{ material: THREE.MeshStandardMaterial; texture: THREE.CanvasTexture }> = [];
    for (const [shader, image] of diffuse) {
      const texture = new THREE.CanvasTexture(image);
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, c.renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      const preset = yft.shaders[shader]?.preset ?? '';
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        metalness: 0.15,
        roughness: 0.6,
        side: THREE.DoubleSide,
        alphaTest: preset.includes('cutout') ? 0.5 : 0,
        transparent: /alpha|decal/.test(preset),
        wireframe,
      });
      c.textured.set(shader, material);
      made.push({ material, texture });
    }
    for (const mesh of c.meshes.values()) {
      const material = c.textured.get(mesh.userData.shader as number);
      const category = mesh.userData.category as PartCategory;
      if (material && category !== 'paint' && category !== 'glass') {
        mesh.userData.textured = material;
        mesh.material = latest.current.selected.has(mesh.userData.partId as string) ? c.selectedMaterials[category] : material;
      }
    }
    c.render();
    return () => {
      for (const mesh of c.meshes.values()) {
        if (mesh.userData.textured) {
          mesh.userData.textured = undefined;
          mesh.material = c.baseMaterials[mesh.userData.category as PartCategory];
        }
      }
      c.textured.clear();
      for (const { material, texture } of made) {
        material.dispose();
        texture.dispose();
      }
      c.render();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yft, parts, diffuse]);

  // Livery über dem Lack: je Teil eine zweite Hülle mit der Livery-Textur auf dem Livery-UV-Satz.
  useEffect(() => {
    const c = ctx.current;
    if (!c || !yft || !livery) return;
    const texture = new THREE.CanvasTexture(livery.image);
    texture.flipY = false; // V = 0 ist oben, wie in den Textur-Zeilen der Spieldateien
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.channel = livery.uvSet;
    texture.anisotropy = Math.min(8, c.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      metalness: 0.35,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const attribute = livery.uvSet === 0 ? 'uv' : `uv${livery.uvSet}`;
    for (const id of livery.partIds) {
      const base = c.meshes.get(id);
      if (!base || !base.geometry.getAttribute(attribute)) continue;
      const overlay = new THREE.Mesh(base.geometry, material);
      overlay.renderOrder = 1;
      overlay.visible = base.visible && !latest.current.selected.has(id);
      c.content.add(overlay);
      c.overlays.set(id, overlay);
    }
    c.render();
    return () => {
      for (const overlay of c.overlays.values()) c.content.remove(overlay);
      c.overlays.clear();
      material.dispose();
      texture.dispose();
      c.render();
    };
  }, [yft, parts, livery]);

  // Kamerabefehle.
  useEffect(() => {
    const c = ctx.current;
    if (!c || !command || !yft) return;
    const box = new THREE.Box3();
    if (command.kind === 'focus' && command.partIds && command.partIds.length > 0) {
      for (const id of command.partIds) {
        const part = parts.find((p) => p.id === id);
        if (part) box.expandByPoint(new THREE.Vector3(...part.boundsMin)).expandByPoint(new THREE.Vector3(...part.boundsMax));
      }
    }
    const focused = !box.isEmpty();
    if (!focused) box.set(new THREE.Vector3(...yft.boundsMin), new THREE.Vector3(...yft.boundsMax));
    const center = box.getCenter(new THREE.Vector3());
    // Richtung von der Mitte zur Kamera. GTA: Fahrzeug blickt nach +Y, links ist -X.
    const direction: Record<ViewPreset, [number, number, number]> = {
      front: [0, 1, 0.25],
      rear: [0, -1, 0.25],
      side: [-1, 0, 0.15],
      top: [0, 0.001, 1],
      iso: [-0.7, 0.6, 0.35],
    };
    const key: ViewPreset = command.kind === 'preset' && command.preset ? command.preset : 'iso';
    // Beim Scharfstellen auf ein Teil bleibt die Blickrichtung, bei Ansichten gilt die Voreinstellung.
    const dir =
      command.kind === 'focus'
        ? c.camera.position.clone().sub(c.controls.target).normalize()
        : new THREE.Vector3(...direction[key]).normalize();
    const dist = Math.max(fitDistance(box, dir, c.camera), focused ? 0.5 : 2);
    c.controls.target.copy(center);
    c.camera.position.copy(center).addScaledVector(dir, dist);
    c.camera.updateProjectionMatrix();
    c.controls.update();
    c.render();
  }, [command, yft, parts]);

  return (
    <div className="viewport vehicle-viewport" ref={host} role="img" aria-label="3D-Ansicht des Fahrzeugs">
      {error ? <p className="viewport-error">{error}</p> : null}
    </div>
  );
}
