#!/usr/bin/env python3
"""Build game-ready assets from the original external asset packs.

Usage:
  python3 tools/build_assets.py <TinySwordsFreePackDir> <AudioRawDir>

- <TinySwordsFreePackDir>: the extracted "Tiny Swords (Free Pack)" folder (Pixel Frog)
- <AudioRawDir>: folder holding the downloaded OpenGameArt audio (see CREDITS.md)

Outputs into public/assets/. Sprites are copied untouched (only the files the
game uses). UI nine-slice sheets are re-packed so CSS border-image can use them.
Audio is loudness-normalised, trimmed and encoded to mp3; music loops are kept
sample-accurate.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets"

COLORS = ["Blue", "Red", "Purple", "Yellow", "Black"]
# Ribbons / swords sheets are stacked in this order (checked visually)
SHEET_COLORS = ["Blue", "Red", "Yellow", "Purple", "Black"]


def copy(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


def build_sprites(ts: Path):
    out = OUT / "sprites"
    if out.exists():
        shutil.rmtree(out)
    # Buildings (all colours: blue = player, others = rival kingdoms)
    for c in COLORS:
        for b in ["Archery", "Barracks", "Castle", "House1", "House2", "House3", "Monastery", "Tower"]:
            copy(ts / "Buildings" / f"{c} Buildings" / f"{b}.png", out / "buildings" / c.lower() / f"{b.lower()}.png")
    # Units
    unit_files = {
        "Warrior": ["Warrior_Idle", "Warrior_Run", "Warrior_Attack1", "Warrior_Attack2", "Warrior_Guard"],
        "Archer": ["Archer_Idle", "Archer_Run", "Archer_Shoot", "Arrow"],
        "Lancer": ["Lancer_Idle", "Lancer_Run", "Lancer_Right_Attack", "Lancer_Right_Defence"],
        "Monk": ["Idle", "Run", "Heal", "Heal_Effect"],
    }
    for c in COLORS:
        for u, files in unit_files.items():
            for f in files:
                name = f.lower().replace(" ", "_")
                if not name.startswith(u.lower()):
                    name = f"{u.lower()}_{name}"
                copy(ts / "Units" / f"{c} Units" / u / f"{f}.png", out / "units" / c.lower() / f"{name}.png")
    for f in (ts / "Units" / "Blue Units" / "Pawn").glob("*.png"):
        name = f.stem.lower().replace(" ", "_")
        copy(f, out / "units" / "blue" / f"{name}.png")
    for c in COLORS[1:]:
        for f in ["Pawn_Idle", "Pawn_Run"]:
            copy(ts / "Units" / f"{c} Units" / "Pawn" / f"{f}.png", out / "units" / c.lower() / f"{f.lower()}.png")
    # Terrain
    t = ts / "Terrain"
    for i in range(1, 6):
        copy(t / "Tileset" / f"Tilemap_color{i}.png", out / "terrain" / f"tilemap{i}.png")
    copy(t / "Tileset" / "Shadow.png", out / "terrain" / "shadow.png")
    copy(t / "Tileset" / "Water Foam.png", out / "terrain" / "foam.png")
    copy(t / "Tileset" / "Water Background color.png", out / "terrain" / "water.png")
    for i in range(1, 5):
        copy(t / "Decorations" / "Bushes" / f"Bushe{i}.png", out / "deco" / f"bush{i}.png")
        copy(t / "Decorations" / "Rocks" / f"Rock{i}.png", out / "deco" / f"rock{i}.png")
        copy(t / "Decorations" / "Rocks in the Water" / f"Water Rocks_0{i}.png", out / "deco" / f"waterrock{i}.png")
    for i in range(1, 9):
        copy(t / "Decorations" / "Clouds" / f"Clouds_0{i}.png", out / "deco" / f"cloud{i}.png")
    copy(t / "Decorations" / "Rubber Duck" / "Rubber duck.png", out / "deco" / "duck.png")
    r = t / "Resources"
    for i in range(1, 7):
        copy(r / "Gold" / "Gold Stones" / f"Gold Stone {i}.png", out / "res" / f"goldstone{i}.png")
        copy(r / "Gold" / "Gold Stones" / f"Gold Stone {i}_Highlight.png", out / "res" / f"goldstone{i}_hl.png")
    copy(r / "Gold" / "Gold Resource" / "Gold_Resource.png", out / "res" / "gold.png")
    copy(r / "Gold" / "Gold Resource" / "Gold_Resource_Highlight.png", out / "res" / "gold_hl.png")
    copy(r / "Wood" / "Wood Resource" / "Wood Resource.png", out / "res" / "wood.png")
    copy(r / "Meat" / "Meat Resource" / "Meat Resource.png", out / "res" / "meat.png")
    for f in ["Sheep_Idle", "Sheep_Move", "Sheep_Grass"]:
        copy(r / "Meat" / "Sheep" / f"{f}.png", out / "res" / f"{f.lower()}.png")
    for i in range(1, 5):
        copy(r / "Wood" / "Trees" / f"Tree{i}.png", out / "res" / f"tree{i}.png")
        copy(r / "Wood" / "Trees" / f"Stump {i}.png", out / "res" / f"stump{i}.png")
        copy(r / "Tools" / f"Tool_0{i}.png", out / "res" / f"tool{i}.png")
    # FX
    for f in (ts / "Particle FX").glob("*.png"):
        copy(f, out / "fx" / f"{f.stem.lower().replace(' ', '_')}.png")
    # UI single images
    ui = ts / "UI Elements" / "UI Elements"
    for f in (ui / "Icons").glob("*.png"):
        copy(f, out / "ui" / "icons" / f"{f.stem.lower()}.png")
    for f in (ui / "Human Avatars").glob("*.png"):
        copy(f, out / "ui" / "avatars" / f"{f.stem.lower()}.png")
    for f in (ui / "Cursors").glob("*.png"):
        copy(f, out / "ui" / f"{f.stem.lower()}.png")
    for f in (ui / "Buttons").glob("Tiny*.png"):
        copy(f, out / "ui" / f"{f.stem.lower()}.png")
    for f in ["SmallBlueRoundButton_Regular", "SmallBlueRoundButton_Pressed", "SmallRedRoundButton_Regular",
              "SmallRedRoundButton_Pressed", "SmallBlueSquareButton_Regular", "SmallBlueSquareButton_Pressed",
              "SmallRedSquareButton_Regular", "SmallRedSquareButton_Pressed"]:
        copy(ui / "Buttons" / f"{f}.png", out / "ui" / f"{f.lower()}.png")
    copy(ui / "Banners" / "Banner_Slots.png", out / "ui" / "banner_slots.png")
    copy(ui / "Wood Table" / "WoodTable_Slots.png", out / "ui" / "woodtable_slots.png")
    copy(ui / "Bars" / "BigBar_Fill.png", out / "ui" / "bigbar_fill.png")
    copy(ui / "Bars" / "SmallBar_Fill.png", out / "ui" / "smallbar_fill.png")
    build_nine_slices(ui, out / "ui")


def pack3(img: Image.Image, cols, rows):
    """Cut the 3x3 (or 3x1) grid of pieces out of a spaced sheet and pack them tightly."""
    widths = [c[1] - c[0] for c in cols]
    heights = [r[1] - r[0] for r in rows]
    res = Image.new("RGBA", (sum(widths), sum(heights)), (0, 0, 0, 0))
    y = 0
    for r, h in zip(rows, heights):
        x = 0
        for c, w in zip(cols, widths):
            res.paste(img.crop((c[0], r[0], c[1], r[1])), (x, y))
            x += w
        y += h
    return res


def build_nine_slices(ui: Path, out: Path):
    meta = {}

    def nine(src, name, cols, rows):
        img = Image.open(src).convert("RGBA")
        p = pack3(img, cols, rows)
        p.save(out / f"{name}.png")
        meta[name] = {"w": p.width, "h": p.height,
                      "slice": [rows[0][1] - rows[0][0] if len(rows) == 3 else 0, cols[2][1] - cols[2][0],
                                rows[2][1] - rows[2][0] if len(rows) == 3 else 0, cols[0][1] - cols[0][0]]}

    g64 = [(0, 64), (128, 192), (256, 320)]
    g128 = [(0, 128), (192, 256), (320, 448)]
    nine(ui / "Papers" / "RegularPaper.png", "paper", g64, g64)
    nine(ui / "Papers" / "SpecialPaper.png", "paper_special", g64, g64)
    nine(ui / "Banners" / "Banner.png", "banner", g128, g128)
    nine(ui / "Wood Table" / "WoodTable.png", "woodtable", g128, g128)
    for v in ["Regular", "Pressed"]:
        for c in ["Blue", "Red"]:
            nine(ui / "Buttons" / f"Big{c}Button_{v}.png", f"btn_{c.lower()}_{v.lower()}", g64, g64)
    # Bars: horizontal 3-slice
    for b in ["BigBar", "SmallBar"]:
        nine(ui / "Bars" / f"{b}_Base.png", b.lower(), g64, [(0, 64)])
    # Ribbons: 5 colours stacked vertically -> one file per colour
    rib = Image.open(ui / "Ribbons" / "BigRibbons.png").convert("RGBA")
    for i, c in enumerate(SHEET_COLORS):
        p = pack3(rib, g128, [(i * 128, i * 128 + 128)])
        p.save(out / f"ribbon_{c.lower()}.png")
        meta[f"ribbon_{c.lower()}"] = {"w": p.width, "h": p.height, "slice": [0, 128, 0, 128]}
    srib = Image.open(ui / "Ribbons" / "SmallRibbons.png").convert("RGBA")
    for i, c in enumerate(SHEET_COLORS):
        for j, kind in enumerate(["a", "b"]):
            y = i * 128 + j * 64
            p = pack3(srib, g64, [(y, y + 64)])
            p.save(out / f"sribbon_{c.lower()}_{kind}.png")
    sw = Image.open(ui / "Swords" / "Swords.png").convert("RGBA")
    for i, c in enumerate(SHEET_COLORS):
        p = pack3(sw, g128, [(i * 128, i * 128 + 128)])
        p.save(out / f"sword_{c.lower()}.png")
    (out / "nineslice.json").write_text(json.dumps(meta, indent=1))


# ---------------------------------------------------------------- audio

def ff(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def sfx(src: Path, dst: Path, gain_db=0.0, trim=True):
    """Trim silence, normalise peak to -1 dBFS (+gain), encode mp3."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.wav")
    filters = []
    if trim:
        filters.append("silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.005")
        filters.append("areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.02,areverse")
    ff("-i", str(src), "-ac", "2", "-ar", "44100", *(["-af", ",".join(filters)] if filters else []), str(tmp))
    # measure peak
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(tmp), "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True)
    peak = 0.0
    for line in r.stderr.splitlines():
        if "max_volume" in line:
            peak = float(line.split(":")[1].replace("dB", "").strip())
    vol = -1.0 - peak + gain_db
    ff("-i", str(tmp), "-af", f"volume={vol}dB,afade=t=out:st=0:d=0.001", "-codec:a", "libmp3lame", "-q:a", "3", str(dst))
    tmp.unlink()


def music(src: Path, dst: Path, loop=True, lufs=-16.0):
    """Loudness-normalise music (two-pass loudnorm) and encode."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af",
                        f"loudnorm=I={lufs}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    txt = r.stderr[r.stderr.rindex("{"):]
    m = json.loads(txt)
    af = (f"loudnorm=I={lufs}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    # loudnorm upsamples internally; force back to 44.1k. For loops we keep the
    # length exact so the WebAudio loop is seamless.
    ff("-i", str(src), "-af", af + ",aresample=44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "160k", str(dst))


def ambience(src: Path, dst: Path, seconds=48.0, xfade=4.0):
    """Cut the calmest stable stretch from a long field recording and make it loop seamlessly."""
    import wave
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".probe.wav")
    ff("-i", str(src), "-ac", "1", "-ar", "8000", str(tmp))
    with wave.open(str(tmp)) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    tmp.unlink()
    win = 8000  # 1 s
    rms = np.sqrt(np.convolve(a ** 2, np.ones(win) / win, mode="valid")[::win])
    need = int(seconds + xfade) + 2
    best, best_score = 60, 1e18
    med = np.median(rms)
    for s in range(60, len(rms) - need - 60, 5):
        seg = rms[s:s + need]
        score = np.std(seg) + abs(np.mean(seg) - med) * 0.5
        if score < best_score:
            best, best_score = s, score
    start = float(best)
    total = seconds + xfade
    raw = dst.with_suffix(".raw.wav")
    ff("-ss", str(start), "-t", str(total), "-i", str(src), "-ac", "2", "-ar", "44100", str(raw))
    # seamless loop: crossfade tail into head
    with wave.open(str(raw)) as w:
        n = w.getnframes()
        d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32).reshape(-1, 2)
    raw.unlink()
    xf = int(xfade * 44100)
    body = d[:-xf].copy()
    tail = d[-xf:]
    t = np.linspace(0, 1, xf)[:, None]
    body[:xf] = body[:xf] * np.sqrt(t) + tail * np.sqrt(1 - t)
    body = body / (np.abs(body).max() + 1e-9) * 0.6 * 32767
    loopwav = dst.with_suffix(".loop.wav")
    with wave.open(str(loopwav), "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(body.astype(np.int16).tobytes())
    ff("-i", str(loopwav), "-codec:a", "libmp3lame", "-b:a", "128k", str(dst))
    loopwav.unlink()
    return start


def build_audio(raw: Path):
    out = OUT / "audio"
    if out.exists():
        shutil.rmtree(out)
    x = raw / "x"
    kr = x / "RPGsounds_Kenney"
    kr = next(kr.rglob("handleCoins.ogg")).parent
    ki = next((x / "kenney_interfaceSounds").rglob("click_001.ogg")).parent
    rp = x / "rpg_sound_pack"
    rp_inv = next(rp.rglob("coin.wav")).parent
    rp_bat = next(rp.rglob("swing.wav")).parent
    sp = next((x / "SoundPack01").rglob("Coin01.aif")).parent
    og_inv = next((x / "inventory_sound_effects").rglob("metal-clash.wav")).parent
    og_bat = next((x / "battle_sound_effects_0").rglob("Bow.wav")).parent

    S = out / "sfx"
    plan = {
        "mine1": (raw / "rock_break.ogg", -3),
        "clink1": (rp_inv / "metal-small1.wav", -8),
        "clink2": (rp_inv / "metal-small2.wav", -8),
        "clink3": (rp_inv / "metal-small3.wav", -8),
        "coin1": (rp_inv / "coin.wav", -4),
        "coin2": (rp_inv / "coin2.wav", -4),
        "coin3": (rp_inv / "coin3.wav", -4),
        "coins1": (kr / "handleCoins.ogg", -2),
        "coins2": (kr / "handleCoins2.ogg", -2),
        "chop": (kr / "chop.ogg", -4),
        "wood": (rp_inv / "wood-small.wav", -6),
        "page1": (kr / "bookFlip1.ogg", -6),
        "page2": (kr / "bookFlip2.ogg", -6),
        "page3": (kr / "bookFlip3.ogg", -6),
        "open": (kr / "bookOpen.ogg", -5),
        "close": (kr / "bookClose.ogg", -5),
        "click": (ki / "click_002.ogg", -8),
        "select": (ki / "select_002.ogg", -8),
        "error": (ki / "error_004.ogg", -8),
        "confirm": (ki / "confirmation_002.ogg", -6),
        "build_done": (sp / "Rise03.aif", -6),
        "upgrade": (sp / "Coin01.aif", -6),
        "levelup": (sp / "Rise07.aif", -6),
        "achievement": (sp / "Upper01.aif", -6),
        "swing1": (rp_bat / "swing.wav", -6),
        "swing2": (rp_bat / "swing2.wav", -6),
        "swing3": (rp_bat / "swing3.wav", -6),
        "unsheathe": (rp_bat / "sword-unsheathe.wav", -6),
        "clash": (og_inv / "metal-clash.wav", -7),
        "bow": (og_bat / "Bow.wav", -7),
        "magic": (rp_bat / "magic1.wav", -6),
        "leather": (kr / "handleSmallLeather.ogg", -6),
        "cloth": (kr / "cloth1.ogg", -8),
        "door": (kr / "doorOpen_1.ogg", -6),
    }
    for k, (src, g) in plan.items():
        sfx(src, S / f"{k}.mp3", g)
        print("sfx", k)

    M = out / "music"
    tracks = {
        "old_tower_inn": "Loop_The_Old_Tower_Inn.wav",
        "bards_tale": "Loop_The_Bards_Tale.wav",
        "minstrel_dance": "Loop_Minstrel_Dance_0.wav",
        "market_day": "Loop_Market_Day.wav",
        "harvest_season": "harvestseason.wav",
        "exploration": "Exploration.wav",
        "battle": "battle_1.wav",
        "victory": "victory.wav",
        "defeat": "defeat.wav",
        "kings_feast": "Loop_Kings_Feast_0.wav",
        "rejoicing": "Loop_Rejoicing.wav",
    }
    for k, f in tracks.items():
        music(raw / f, M / f"{k}.mp3")
        print("music", k)
    st = ambience(raw / "Vistula.mp3", out / "ambience" / "waves.mp3")
    print("ambience from", st)


if __name__ == "__main__":
    ts, raw = Path(sys.argv[1]), Path(sys.argv[2])
    only = sys.argv[3] if len(sys.argv) > 3 else "all"
    if only in ("all", "sprites"):
        build_sprites(ts)
    if only in ("all", "audio"):
        build_audio(raw)
    if only == "ambience":
        print(ambience(raw / "Vistula.mp3", OUT / "audio" / "ambience" / "waves.mp3"))
    print("done")
