#!/usr/bin/env bash
# CI テストスクリプト（第8章 品質ゲート）
# 使い方: bash tools/ci_test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GODOT_BIN="${GODOT_BIN:-godot}"

echo "== [1/3] Godot バージョン確認 =="
"$GODOT_BIN" --headless --version

echo "== [2/3] プロジェクト起動検証（エラー・ワーニング0件が必須）=="
"$GODOT_BIN" --headless --quit-after 100 2>&1 | tee /tmp/arena3v3_boot.log
if grep -Ei "ERROR|SCRIPT ERROR|WARNING" /tmp/arena3v3_boot.log; then
	echo "起動時にエラー/ワーニングが検出されました。上記ログを確認してください。" >&2
	exit 1
fi

echo "== [3/3] gdUnit4 テストランナー実行 =="
"$GODOT_BIN" --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd -a tests/ --ignoreHeadlessMode

echo "== 全テスト完了 =="
