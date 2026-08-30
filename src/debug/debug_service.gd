extends Node
## DebugService: 開発ビルド専用のオーバーレイ表示・チートコマンド実行窓口（Autoload）。

signal debug_overlay_toggled(is_overlay_visible: bool)

var _is_overlay_visible: bool = false


func toggle_overlay() -> void:
	_is_overlay_visible = not _is_overlay_visible
	debug_overlay_toggled.emit(_is_overlay_visible)


func is_overlay_visible() -> bool:
	return _is_overlay_visible
