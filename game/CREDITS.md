# Credits

All third-party assets are CC0 1.0 (public domain). Credit is not required but given gladly.

| Asset | Author | License | Used for |
|---|---|---|---|
| [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) (Standard) | Quaternius | CC0 | Character bodies and hairstyles (`public/assets/models/Superhero_*.glb`, `Hair_*.glb`) |
| [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) (Standard) | Quaternius | CC0 | Animations (`anims1.glb`) |
| [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2) (Standard) | Quaternius | CC0 | Animations (`anims2.glb`) |
| [Particle Pack](https://kenney.nl/assets/particle-pack) | Kenney | CC0 | Hit flashes, sparks, slash arcs, smoke, debris, rings, just-guard seal, spin swirl (`public/assets/fx`) |
| [Blaster Kit](https://kenney.nl/assets/blaster-kit) | Kenney | CC0 | Star's pistols (`blaster-j` → `Blaster.glb`), Zip's hook launcher (`blaster-h` → `HookGun.glb`) |
| [Cute umbrella](https://opengameart.org/content/cute-umbrella) | ege | CC0 | Ameri's umbrella (`public/assets/models/Umbrella.glb`, converted from .blend with `tools/umbrella-export.py`, texture greyed for tinting) |
| [5 Chiptunes (Action)](https://opengameart.org/content/5-chiptunes-action) | Juhani Junkala (SubspaceAudio) | CC0 | BGM (`bgm_menu.mp3` = Title Screen, `bgm_battle.mp3` = Level 1) |
| [Impact Sounds](https://kenney.nl/assets/impact-sounds), [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds), [Digital Audio](https://kenney.nl/assets/digital-audio) | Kenney | CC0 | Sound effects (`public/assets/audio`) |

Outfits (jacket, pants, gauntlets, bow, toy hammer, katana, yo-yo, suction-cup grapple head, sneakers), the arena, the comic speed lines / hex barrier / trails and the fallback synth sounds are made in code for this project; the blaster and sprite effects fall back to code-built versions if their files are missing. Kenney sounds were converted from OGG to MP3 for wider browser support.

## Rebuilding the models

`tools/build-assets.mjs` converts the downloaded packs into the optimized GLBs
(drops normal/roughness maps, resizes base color textures, keeps only the
animations the game uses). It needs `@gltf-transform/core`, `@gltf-transform/extensions`,
`@gltf-transform/functions` and `sharp`.

`tools/build-fx.mjs` packs the Kenney Particle Pack sprites (white + alpha PNGs)
and the Blaster Kit pistol with the same dependencies.
