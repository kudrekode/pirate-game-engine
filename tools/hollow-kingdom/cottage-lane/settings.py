"""Merewatch cottage lane source parameters. Dimensions are metres, Blender Z up."""
SIZE = 256
GUTTER = 4
SEED = 91243
LAYOUT = {
    "cottage": ("plaster", "oak", "stone", "slate", "iron", "clay", "lichen", "grain"),
    "wall": ("stone", "lichen"),
    "ash": ("bark",),
    "bank": ("stone", "lichen", "leaf", "grass"),
    "woodpile": ("bark", "grain", "oak", "stone"),
}
COTTAGE = {"width": 4.72, "depth": 4.45, "sill": .63, "eave": 3.02, "ridge": 5.55}
ASH = {"height": 6.8, "crown_radius": 2.22, "trunk_radius": .20}
WALL = {"length": 2.8, "width": .51, "courses": 4}
BANK = {"width": 2.0, "depth": 1.2, "ferns": 5, "tussocks": 9}
