"""Erzeugt eine kleine Werkzeugkiste als GLB für Ende-zu-Ende-Tests der Website.

Aufruf: blender -b --factory-startup --python make-toolbox-glb.py -- <ausgabe.glb>

Inhalt: Korpus und Deckel (rot, mit Schachbrett-Textur 100x100, also KEINE Zweierpotenz), ein Henkel aus einem Zylinder
(graues Metall ohne Textur). Maße: 0,6 x 0,3 x 0,3 m, Boden bei Z = 0 (Blender, Z oben).
"""
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = os.path.abspath(argv[0] if argv else "toolbox.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)

# --- Materialien ---------------------------------------------------------------------------------
img = bpy.data.images.new("toolbox_paint", width=100, height=100, alpha=False)
px = []
for y in range(100):
    for x in range(100):
        on = ((x // 10) + (y // 10)) % 2 == 0
        px.extend((0.78, 0.12, 0.10, 1.0) if on else (0.55, 0.06, 0.05, 1.0))
img.pixels = px
img.pack()

paint = bpy.data.materials.new("paint")
paint.use_nodes = True
bsdf = paint.node_tree.nodes["Principled BSDF"]
tex = paint.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
paint.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

metal = bpy.data.materials.new("metal")
metal.use_nodes = True
mb = metal.node_tree.nodes["Principled BSDF"]
mb.inputs["Base Color"].default_value = (0.55, 0.57, 0.60, 1.0)
mb.inputs["Metallic"].default_value = 1.0
mb.inputs["Roughness"].default_value = 0.35


def uv_cube(name, size, location, material):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    return o


uv_cube("body", (0.6, 0.3, 0.2), (0.0, 0.0, 0.1), paint)
uv_cube("lid", (0.62, 0.32, 0.04), (0.0, 0.0, 0.22), paint)

bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.015, depth=0.28, location=(0.0, 0.0, 0.29))
handle = bpy.context.active_object
handle.name = "handle"
handle.rotation_euler = (math.radians(90), 0.0, math.radians(90))
bpy.ops.object.transform_apply(rotation=True)
handle.data.materials.append(metal)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_apply=True)
print("GLB geschrieben:", out, os.path.getsize(out), "Byte")
