"""assets-manifest.json から ASSETS.md の素材一覧表を生成する（記載漏れ防止）。
使い方: python3 scripts/gen-assets-md.py > ASSETS.md
"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
m = json.load(open(os.path.join(root, 'src/data/assets-manifest.json'), encoding='utf-8'))
CHECKED = '2026-11-04'
MODS = {
    'unit_goblin': '黒背景を透過に変更', 'unit_wyvern': '黒背景を透過に変更',
    'fx_flame': '黒背景を透過に変更', 'fx_magic_orb': '黒背景を透過に変更',
}
USE = {
    'unit_swordsman': 'カード「剣士」', 'unit_archer': 'カード「弓兵」', 'unit_heavy_knight': 'カード「重装騎士」',
    'unit_goblin': 'カード「ゴブリン隊」', 'unit_mage': 'カード「魔術師」', 'unit_wyvern': 'カード「飛竜」',
    'bld_cannon': 'カード「防衛砲台」', 'fx_flame': 'カード「火球」・飛竜の炎', 'fx_magic_orb': '魔術師の魔弾',
    'fx_arrow': '弓兵・守護塔の矢', 'fx_cannonball': '防衛砲台・王の塔の砲弾', 'fx_heart': '回復エフェクト',
    'fx_explosion': '爆発・死亡・塔破壊エフェクト',
    'icon_attack': 'カード「鼓舞の角笛」・攻撃バフ表示', 'icon_shield': 'カード「守りの加護」・シールド表示',
    'icon_haste': 'カード「疾風の加護」・速度バフ表示', 'icon_heal': 'カード「癒しの光」',
    'bgm_title': 'タイトル BGM', 'bgm_battle': 'バトル BGM', 'bgm_battle_final': '残り1分〜延長の BGM',
    'bgm_win': '勝利ジングル', 'bgm_lose': '敗北ジングル',
}
def use(k):
    if k in USE: return USE[k]
    if k.startswith('tile_castle'): return '塔（城タイルを組み合わせ）'
    if k.startswith('tile_flag'): return '塔の旗（チーム色）'
    if k.startswith('tile_'): return 'アリーナ地形・装飾'
    if k.startswith('ui_'): return 'カード枠・パネル・ボタン'
    if k.startswith('se_'): return '効果音 ' + k[3:]
    return ''
src = {s['id']: s for s in m['sources']}
out = sys.stdout
out.write('# ASSETS.md — 使用素材の記録\n\n')
out.write('> この表は `scripts/gen-assets-md.py` で `src/data/assets-manifest.json` から生成しています。素材を追加・差し替えたらマニフェストを更新し、再生成してください。\n\n')
out.write(f'- 確認日: {CHECKED}（配布ページ上のライセンス表記を確認）\n')
b = [s for s in m['sources'] if s['category'] == 'B']
out.write(f'- ライセンス区分: A（明記あり）{len(m["sources"]) - len(b)} 件 / B（表記なし）{len(b)} 件 / C（不可）は不使用\n')
out.write('- 市販ゲーム由来の素材（ripped assets）や Supercell 社の素材は一切含みません。\n')
out.write('- すべて CC0 または SIL OFL のため、クレジット表記は義務ではありませんが、ゲーム内クレジット画面に全作者を表示しています。\n\n')
out.write('## 素材パック（入手元）\n\n| ID | 素材名 | 作者 | 入手元 | 区分 | ライセンス | クレジット表記 |\n|---|---|---|---|---|---|---|\n')
for s in m['sources']:
    req = '必要（OFL 同梱）' if 'OFL' in s['license'] else '任意（表示済み）'
    out.write(f"| {s['id']} | {s['name']} | {s['author']} | {s['url']} | {s['category']} | [{s['license']}]({s['licenseUrl']}) | {req} |\n")
out.write('\n## ファイルごとの対応\n\n| キー | ファイル | 素材パック | 元ファイル | 改変 | 用途 |\n|---|---|---|---|---|---|\n')
for group in ('images', 'spritesheets', 'audio', 'fonts'):
    for a in m[group]:
        mod = MODS.get(a['key'], '')
        if group == 'audio': mod = (mod + '；' if mod else '') + 'MP3 に変換（音量・長さは無改変）'
        if a['key'].startswith('tile_') or a['key'].startswith('unit_') or a['key'] in ('bld_cannon',) or a['key'].startswith('icon_') or a['key'].startswith('fx_') and group == 'images':
            mod = mod or 'なし（タイルシートから1枚を抽出）'
        out.write(f"| `{a['key']}` | `public/{a['path']}` | {a['source']} | {a['original']} | {mod or 'なし'} | {use(a['key']) or 'フォント（全画面）'} |\n")
out.write('\n## 見た目の統一方針\n\n')
out.write('- メインパックは **Kenney の Tiny シリーズ**（Tiny Dungeon / Tiny Town / Tiny Battle、16px ドット絵・真上視点）。不足したゴブリンと竜は、同じ 16px・同じ縁取りの作風で作られた Clint Bellanger 作「Tiny Creatures」で補った。\n')
out.write('- UI も同じ Kenney の「UI Pack - Pixel Adventure」で統一。ドット絵以外の素材は混ぜていない。\n')
out.write('- 16px の素材は描画時に 2 倍（32px＝1 タイル）を基準にし、ユニットごとの大きさは `cards.json` の `displayScale` で正規化している（ゴブリン 1.6／弓兵 1.8／剣士・魔術師 2.0／飛竜 2.4／重装騎士・砲台 2.6）。\n')
out.write('- 単一フレームの素材のため、歩行・攻撃・出現・被弾は Tween（上下の揺れ・拡大・白点滅・フェード）で表現している。\n')
