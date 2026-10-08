"""Dekodiert eine DDS-Datei mit Pillow und schreibt die Pixel als rohes RGBA (Breite*Höhe*4 Byte) in eine Datei.
Dient verify-bc7.ts als unabhängige Gegenprobe für den BC7-Dekodierer.

    python pillow_decode.py eingabe.dds ausgabe.rgba
"""
import sys

from PIL import Image

with Image.open(sys.argv[1]) as image:
    rgba = image.convert("RGBA")
    with open(sys.argv[2], "wb") as out:
        out.write(rgba.tobytes())
    print(rgba.width, rgba.height)
