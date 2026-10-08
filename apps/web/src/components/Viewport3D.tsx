import { computeBounds } from '@toolkit/forge-core';
import type { ModelData } from '@toolkit/forge-core';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface CollisionOverlay {
  positions: Float32Array;
  indices: Uint32Array;
}

interface Props {
  /** Modell im GTA-Koordinatensystem (Z oben). */
  model: ModelData | null;
  showReference: boolean;
  collision: CollisionOverlay | null;
  showCollision: boolean;
}

interface Scene3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  reference: THREE.Mesh;
  collisionGroup: THREE.Group;
  render: () => void;
}

const AMBER = 0xe8a33d;

function createTexture(rgba: Uint8Array, width: number, height: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(rgba), width, height, THREE.RGBAFormat);
  tex.flipY = false; // Bilddaten liegen mit der obersten Zeile zuerst, UV-Ursprung ist oben links.
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
  group.clear();
}

export function Viewport3D({ model, showReference, collision, showCollision }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<Scene3D | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Szene einmalig aufbauen.
  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    } catch {
      setError('WebGL wird von diesem Browser nicht unterstützt.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x14161b, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
    camera.up.set(0, 0, 1); // GTA: Z ist oben
    camera.position.set(3, -4, 2.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3d44, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, -3, 8);
    scene.add(sun);

    const grid = new THREE.GridHelper(40, 40, 0x555a66, 0x2b2f38);
    grid.rotation.x = Math.PI / 2; // GridHelper liegt standardmäßig in XZ, wir brauchen XY.
    scene.add(grid);

    const content = new THREE.Group();
    scene.add(content);
    const collisionGroup = new THREE.Group();
    scene.add(collisionGroup);

    // Spielfigur: 1,8 m hoch (Kapsel: 1,36 + 2 * 0,22).
    const reference = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 1.36, 4, 14),
      new THREE.MeshStandardMaterial({ color: AMBER, transparent: true, opacity: 0.35, roughness: 0.9 }),
    );
    reference.rotation.x = Math.PI / 2;
    reference.visible = false;
    scene.add(reference);

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

    ctx.current = { renderer, scene, camera, controls, content, reference, collisionGroup, render };

    return () => {
      observer.disconnect();
      controls.dispose();
      disposeGroup(content);
      disposeGroup(collisionGroup);
      reference.geometry.dispose();
      (reference.material as THREE.Material).dispose();
      grid.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  // Modell ersetzen und Kamera darauf ausrichten.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    disposeGroup(c.content);

    if (!model) {
      c.reference.position.set(1, 0, 0.9);
      c.render();
      return;
    }

    const textures = model.textures.map((t) => createTexture(t.rgba, t.width, t.height));
    for (const part of model.parts) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(part.indices, 1));
      geo.computeBoundingSphere();

      const m = model.materials[part.materialIndex];
      const tex = m?.textureIndex != null ? textures[m.textureIndex] : undefined;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(m?.baseColor[0] ?? 1, m?.baseColor[1] ?? 1, m?.baseColor[2] ?? 1, THREE.SRGBColorSpace),
        map: tex ?? null,
        roughness: 0.75,
        metalness: 0,
        side: THREE.FrontSide,
      });
      c.content.add(new THREE.Mesh(geo, mat));
    }

    const b = computeBounds(model);
    if (b) {
      const center = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      const size = new THREE.Vector3(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      const radius = Math.max(size.length() / 2, 0.25);
      const dist = radius / Math.sin(THREE.MathUtils.degToRad(c.camera.fov / 2)) * 1.1;
      c.controls.target.copy(center);
      c.camera.position.set(center.x + dist * 0.6, center.y - dist * 0.8, center.z + dist * 0.45);
      c.camera.near = Math.max(dist / 500, 0.01);
      c.camera.far = dist * 50;
      c.camera.updateProjectionMatrix();
      c.controls.update();
      c.reference.position.set(b.max[0] + 0.7, center.y, 0.9);
    }
    c.render();
  }, [model]);

  // Spielfigur ein- und ausblenden.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    c.reference.visible = showReference;
    c.render();
  }, [showReference, model]);

  // Kollisions-Überlagerung.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    disposeGroup(c.collisionGroup);
    if (collision && showCollision) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(collision.positions, 3));
      geo.setIndex(new THREE.BufferAttribute(collision.indices, 1));
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x4fd1a5 }));
      const fill = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0x4fd1a5, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
      );
      c.collisionGroup.add(fill, wire);
    }
    c.render();
  }, [collision, showCollision]);

  return (
    <div className="viewport" ref={host} role="img" aria-label="3D-Vorschau">
      {error ? <p className="viewport-error">{error}</p> : null}
    </div>
  );
}
