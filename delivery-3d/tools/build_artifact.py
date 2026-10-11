"""index.html から Artifact 公開用の1ページを作る。

使い方: python3 tools/build_artifact.py <出力先.html>
ページ本体（<!--GAME-BODY-START-->〜END）と CSS をインライン化し、
js/・lib/・assets/ は同じ相対パスで別ファイルとして公開する前提。
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css' / 'style.css').read_text(encoding='utf-8')
body = re.search(r'<!--GAME-BODY-START-->(.*)<!--GAME-BODY-END-->', html, re.S).group(1)
fonts = re.search(r'<link href="(https://fonts\.googleapis\.com/[^"]+)" rel="stylesheet">', html).group(1)

page = f'''<title>あおば町 宅配日誌</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{fonts}" rel="stylesheet">
<style>
:root {{ color-scheme: dark; }}
html, body {{ height: 100%; }}
{css}
</style>
<script type="importmap">
{{ "imports": {{ "three": "./lib/three.module.js", "three/addons/": "./lib/addons/" }} }}
</script>
{body.strip()}
<script type="module" src="js/main.js"></script>
'''
out = pathlib.Path(sys.argv[1])
out.write_text(page, encoding='utf-8')
print(out, len(page.encode()))
