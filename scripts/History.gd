extends RefCounted

# 仕様書7章「履歴」: アンドゥ／リドゥは無制限（メモリ上限のみ）。
# 1操作＝1エントリ。盤面全体のコピーではなく、差分（追加/削除されたパーツ）のみ持つ。
# エントリの形: {"added": Array[PieceInstance], "removed": Array[PieceInstance]}
# 適用方向はここでは決めない（World/Rendererへの反映は呼び出し側=BuildSystemが行う）。

var _entries: Array = []
var _index: int = 0 # _entries[0 ..< _index] が現在適用済み。それ以降がリドゥ用の残り。

func push_entry(entry: Dictionary) -> void:
	_entries.resize(_index)
	_entries.append(entry)
	_index += 1

func can_undo() -> bool:
	return _index > 0

func can_redo() -> bool:
	return _index < _entries.size()

# 呼び出し側は返ってきたエントリの added を取り消し（削除）、removed を復元（再設置）すること。
func pop_for_undo() -> Dictionary:
	_index -= 1
	return _entries[_index]

# 呼び出し側は返ってきたエントリの added をやり直し（再設置）、removed をやり直し（再削除）すること。
func pop_for_redo() -> Dictionary:
	var entry: Dictionary = _entries[_index]
	_index += 1
	return entry

func position_text() -> String:
	return "%d / %d" % [_index, _entries.size()]
