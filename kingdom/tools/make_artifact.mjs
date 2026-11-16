// dist-artifact/ のビルド結果から、claude.ai アーティファクト用の 1 枚の HTML を組み立てる。
// CSS と JS はページに直接埋め込み、画像・音声は public/assets を同じ相対パスで別ファイルとして公開する。
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const dir = 'dist-artifact/assets';
const files = readdirSync(dir);
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8').replaceAll('url(../assets/', 'url(assets/').replaceAll('url(/assets/', 'url(assets/');
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replaceAll('</script', '<\\/script');
const src = readFileSync('index.html', 'utf8');
const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('<script type="module"')).trim();

const html = `<title>ちいさな王国</title>
<meta name="description" content="金鉱石を叩いて王国を育てる放置クリッカー。">
<meta name="theme-color" content="#47aba9">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap">
<style>
${css}
</style>
${body}
<script type="module">
${js}
</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/index.html', html);
console.log('artifact/index.html', (html.length / 1024).toFixed(0) + 'KB');
