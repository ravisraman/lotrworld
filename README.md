# Middle-earth — a living world

A real-time 3D journey through ten regions inspired by *The Lord of the Rings*,
built with Three.js. Every landscape, building, tree, and character is
procedural — no downloaded models, no textures, no network requests.

## Running it

Serve the repository root with any static server and open it:

```
python3 -m http.server 8000
# → http://localhost:8000/
```

(Any static host works — GitHub Pages included. The app is a plain ES-module
page with a local vendored copy of Three.js; no build step, no network
requests.)

## The regions

1. **The Shire** — Hobbiton at golden hour: Bag End under its oak, Bagshot Row,
   the Party Tree, the mill and bridge on the Water, chimney smoke, gardens,
   and hobbits about their day — including a wizard arriving by cart.
2. **Bree** — night and rain, lantern pools on wet cobbles, the Prancing Pony,
   hooded townsfolk hurrying, a ranger in the shadows, and a Black Rider.
3. **Rivendell** — an autumn gorge of waterfalls, terraced pavilions, elven
   bridges, drifting gold leaves, and the fair folk on their terraces.
4. **Caradhras** — the Redhorn pass in a blizzard, nine walkers and a pony in
   single file on a knife-edge ledge.
5. **Moria** — the Dwarrowdelf's endless pillars under pale light shafts,
   Balin's tomb, goblin eyes in the dark, and the Bridge of Khazad-dûm:
   a grey wizard, staff raised, before a creature of shadow and flame.
6. **Lothlórien** — Caras Galadhon by night: silver mallorns, spiral stairs,
   lantern-lit talans, niphredil in the sward, and the Lady radiant in white.
7. **Rohan** — Edoras on its rocky crag in a golden grass sea, Meduseld's
   gabled hall, banners of the Mark, and an éored at full gallop.
8. **Isengard** — Orthanc's four-horned crown over a scarred ring of smoking
   fire-pits, felled forests, toiling orcs, and wheeling crebain.
9. **Minas Tirith** — seven white tiers against Mindolluin, the stone keel,
   the White Tree and its guards, the Pelennor patchwork, and Mordor
   smouldering on the horizon.
10. **Mordor** — Orodruin in eruption, lava rivers, marching torch-columns,
    Nazgûl circling Barad-dûr beneath the lidless Eye — and two small figures
    climbing the mountain.

## Controls

| Key | Action |
| --- | --- |
| `1`–`0` | travel to a region |
| `T` | the grand tour — every region, every shot, letterboxed |
| `F` | free flight (drag to look, `WASD` fly, `Q/E` rise/sink, `Shift` speed) |
| `H` | hide the interface |

Left-edge dots navigate; each region cycles its cinematic shots when idle.

## How it's built

- `js/engine/` — sky domes with procedural cloud banks, painted mountain-ring
  backdrops, vertex-painted terrain heightfields, instanced trees/grass/rocks,
  water/waterfall/banner/smoke/particle shaders, a procedural character system
  with walk cycles and path-following crowds, cinematic dolly shots on
  Catmull-Rom rails, and a film grade (bloom, per-region color grade,
  vignette, grain).
- `js/regions/` — one module per region: terrain function, palette,
  architecture, atmosphere, inhabitants, and camera shots.
- Quality was iterated with an automated judge loop: headless screenshots of
  every shot in every region were scored by a panel of film-cinematography
  judge agents against the movies' looks, and their fix lists drove each
  revision round.

Created as a fan work inspired by J.R.R. Tolkien's Middle-earth and its film
adaptations; all geometry and art here are original and procedural.
