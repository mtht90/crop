#!/usr/bin/env python3
"""ゲームで使う文字だけを含むWebフォント(woff2)を作る。

使い方:
  npm pack @expo-google-fonts/m-plus-rounded-1c @expo-google-fonts/dela-gothic-one
  (それぞれ展開して TTF のあるフォルダを指定)
  pip install fonttools brotli
  python3 scripts/subset-fonts.py <M PLUS Rounded 1c のTTFフォルダ> <Dela Gothic One のTTFフォルダ>

元フォントはどちらも SIL Open Font License 1.1。
派生物であることが分かるよう、ファミリー名を "EW Rounded" / "EW Display" に変えて出力する。
"""
import pathlib, sys
from fontTools import subset
from fontTools.ttLib import TTFont

root = pathlib.Path(__file__).resolve().parent.parent
chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set('　、。・「」『』（）〜ー…★☆●○◆■□▲△▼▽→←↑↓！？：；％＋−×÷“”‘’☠🔒🏆🎁✓')
for p in list((root / 'src').rglob('*.js')) + [root / 'index.html']:
    chars |= set(p.read_text(encoding='utf-8'))
chars = {c for c in chars if ord(c) >= 0x20}
text = ''.join(sorted(chars))

mplus, dela = map(pathlib.Path, sys.argv[1:3])
jobs = [
    (mplus / '400Regular' / 'MPLUSRounded1c_400Regular.ttf', 'ew-rounded-400.woff2', 'EW Rounded'),
    (mplus / '800ExtraBold' / 'MPLUSRounded1c_800ExtraBold.ttf', 'ew-rounded-800.woff2', 'EW Rounded'),
    (mplus / '900Black' / 'MPLUSRounded1c_900Black.ttf', 'ew-rounded-900.woff2', 'EW Rounded'),
    (dela / '400Regular' / 'DelaGothicOne_400Regular.ttf', 'ew-display-400.woff2', 'EW Display'),
]
out = root / 'src' / 'fonts'
out.mkdir(exist_ok=True)
for src, name, family in jobs:
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    for rec in font['name'].names:
        if rec.nameID in (1, 4, 16):
            rec.string = family
        if rec.nameID == 6:
            rec.string = family.replace(' ', '') + '-' + name.split('-')[-1].split('.')[0]
    font.flavor = 'woff2'
    font.save(out / name)
    print(name, (out / name).stat().st_size // 1024, 'KB', len(text), 'chars')
