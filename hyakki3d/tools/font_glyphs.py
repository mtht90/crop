#!/usr/bin/env python3
"""ゲーム内で使う文字だけを集めて、Google Fonts の text= サブセットを index.html に書き込む。

Google Fonts の通常配信は日本語を百数十の断片に分け、画面に初めて出た文字の断片を
その場で取りに行く。そのため術名やバナーが一瞬だけ代替フォントで表示される。
使う文字を 1 ファイルにまとめて先に読ませれば、どの文字も最初から正しい書体で出る。
文言を足したらこのスクリプトを再実行する（載っていない文字は端末の書体で出る）。
"""
import pathlib, re, urllib.parse

root = pathlib.Path(__file__).resolve().parent.parent
src = ''.join(p.read_text(encoding='utf-8') for p in sorted(root.glob('js/**/*.js')))
src += (root / 'index.html').read_text(encoding='utf-8') + (root / 'css/style.css').read_text(encoding='utf-8')
src = re.sub(r'//[^\n]*|/\*.*?\*/', '', src, flags=re.S)
chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= {c for c in src if ord(c) > 0x7f}
text = ''.join(sorted(chars))
url = ('https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Yuji+Boku'
       '&family=Zen+Maru+Gothic:wght@500;700;900&display=block&text=' + urllib.parse.quote(text, safe=''))
html = (root / 'index.html').read_text(encoding='utf-8')
line = f'  <link id="fontSubset" href="{url}" rel="stylesheet">'
html, n = re.subn(r'  <link id="fontSubset"[^\n]*', lambda m: line, html)
if not n:
    html = html.replace('  <link rel="stylesheet" href="css/style.css">', line + '\n  <link rel="stylesheet" href="css/style.css">')
assert 'id="fontSubset"' in html
(root / 'index.html').write_text(html, encoding='utf-8')
print(f'{len(text)} chars, url {len(url)} bytes')
