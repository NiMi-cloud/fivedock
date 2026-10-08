"""Erzeugt ein Blatt-Modell mit durchsichtiger Textur als GLB für Tests der Durchsichtigkeit.

Aufruf: blender -b --factory-startup --python make-leaf-glb.py -- <ausgabeordner>

Es entstehen zwei Dateien mit derselben Geometrie (zwei Karten, gekreuzt):
  leaf_mask.glb   Alpha-Modus MASK  (scharfe Kante, Kreis)
  leaf_blend.glb  Alpha-Modus BLEND (weicher Verlauf)
"""
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out_dir = os.path.abspath(argv[0] if argv else ".")
os.makedirs(out_dir, exist_ok=True)


def set_alpha_mode(path, mode, cutoff):
    """Setzt alphaMode im JSON-Block einer GLB-Datei. Blenders Exporter schreibt MASK nur über eine eigene
    Knotenkonstruktion; hier setzen wir es direkt, damit der Test den glTF-Pfad unabhängig davon prüft."""
    import json
    import struct

    data = open(path, "rb").read()
    json_len, json_type = struct.unpack_from("<II", data, 12)
    assert json_type == 0x4E4F534A  # "JSON"
    doc = json.loads(data[20:20 + json_len].decode("utf-8"))
    for material in doc["materials"]:
        material["alphaMode"] = mode
        material["alphaCutoff"] = cutoff
    text = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    text += b" " * ((4 - len(text) % 4) % 4)
    rest = data[20 + json_len:]
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(text) + len(rest))
    open(path, "wb").write(header + struct.pack("<II", len(text), json_type) + text + rest)


def build(mode, soft):
    bpy.ops.wm.read_factory_settings(use_empty=True)

    img = bpy.data.images.new("leaf_" + mode, width=64, height=64, alpha=True)
    px = []
    for y in range(64):
        for x in range(64):
            d = math.hypot(x - 31.5, y - 31.5) / 30.0
            alpha = max(0.0, min(1.0, 1.5 - 1.5 * d)) if soft else (1.0 if d < 1.0 else 0.0)
            px.extend((0.2, 0.7, 0.2, alpha))
    img.pixels = px
    img.pack()

    mat = bpy.data.materials.new("leaf")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    # Blender 4.2+: der glTF-Export leitet den Alpha-Modus aus der Render-Methode des Materials ab.
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED" if mode == "blend" else "DITHERED"
    mat.blend_method = "BLEND" if mode == "blend" else "CLIP"

    for rotation in (0.0, 90.0):
        bpy.ops.mesh.primitive_plane_add(size=0.5, location=(0.0, 0.0, 0.25))
        o = bpy.context.active_object
        o.rotation_euler = (math.radians(90), 0.0, math.radians(rotation))
        bpy.ops.object.transform_apply(rotation=True)
        o.data.materials.append(mat)

    path = os.path.join(out_dir, "leaf_%s.glb" % mode)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True)
    if mode == "mask":
        set_alpha_mode(path, "MASK", 0.5)
    print("GLB geschrieben:", path, os.path.getsize(path), "Byte")


build("mask", soft=False)
build("blend", soft=True)
