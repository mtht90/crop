#!/usr/bin/env bash
# CI テストスクリプト（第8章 品質ゲート）
# 使い方: bash tools/ci_test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GODOT_BIN="${GODOT_BIN:-godot}"

echo "== [1/4] Godot バージョン確認 =="
"$GODOT_BIN" --headless --version

# .godot/ はコミットされない（.gitignore）ため、新規クローン直後は
# グローバルスクリプトクラスキャッシュが存在しない。この状態で直接
# --headless --quit-after を実行すると、class_name を介して他スクリプトを
# 参照する Autoload（NetService の Result 型参照など）がパースエラーになる
# ことを実測確認した（docs/DECISIONS.md ADR-017）。
# そのため、まず --editor --quit-after でキャッシュを構築するウォームアップを
# 必ず一度通す。既にキャッシュがある場合も無害（再スキャンするだけ）。
echo "== [2/4] グローバルスクリプトクラスキャッシュのウォームアップ =="
"$GODOT_BIN" --headless --editor --quit-after 60 --path "$REPO_ROOT" > /tmp/arena3v3_warmup.log 2>&1 || true
if grep -Ei "Parse Error|Compile Error|Failed to load script" /tmp/arena3v3_warmup.log; then
	echo "ウォームアップ中にスクリプトのパース/コンパイルエラーが検出されました。" >&2
	cat /tmp/arena3v3_warmup.log >&2
	exit 1
fi

echo "== [3/4] プロジェクト起動検証（エラー・ワーニング0件が必須）=="
"$GODOT_BIN" --headless --quit-after 100 2>&1 | tee /tmp/arena3v3_boot.log
if grep -Ei "ERROR|SCRIPT ERROR|WARNING" /tmp/arena3v3_boot.log; then
	echo "起動時にエラー/ワーニングが検出されました。上記ログを確認してください。" >&2
	exit 1
fi

echo "== [4/4] gdUnit4 テストランナー実行 =="
"$GODOT_BIN" --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd -a tests/ --ignoreHeadlessMode

echo "== 全テスト完了 =="
