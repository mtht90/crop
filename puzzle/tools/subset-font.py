# Rebuilds the めもかっち subset with every character the game's text uses (plus kana, ASCII and
# punctuation). Run it after adding text with new kanji, then point index.html at the printed file.
# usage: python3 tools/subset-font.py <full めもかっち .ttf>
import glob, hashlib, os, sys
from fontTools import subset
from fontTools.ttLib import TTFont
src = sys.argv[1]
text = ''.join(open(f).read() for f in glob.glob('src/**/*.ts', recursive=True) + ['index.html'])
cps = {ord(c) for c in text if ord(c) > 0x7f}
for a, b in [(0x20, 0x7e), (0x3000, 0x303f), (0x3040, 0x309f), (0x30a0, 0x30ff), (0xff00, 0xffef), (0x2010, 0x2027), (0x2190, 0x21ff), (0x2600, 0x26ff)]:
    cps |= set(range(a, b + 1))
font = TTFont(src)
cps &= set(font.getBestCmap())
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
s = subset.Subsetter(opts)
s.populate(unicodes=sorted(cps))
s.subset(font)
font.flavor = 'woff2'
tmp = 'public/fonts/memokatchi-new.woff2'
font.save(tmp)
# the hash in the name busts CDN and service-worker caches
name = f"public/fonts/memokatchi-{hashlib.sha1(open(tmp, 'rb').read()).hexdigest()[:8]}.woff2"
os.replace(tmp, name)
print(name, os.path.getsize(name), 'bytes,', len(cps), 'characters')
