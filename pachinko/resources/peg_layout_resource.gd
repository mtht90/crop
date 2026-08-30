@tool
class_name PegLayoutResource
extends Resource

## 釘配置エディタ(addons/peg_layout_editor)で保存/読込する釘レイアウトデータ。
## PegBoardのローカル座標系での各釘位置を保持する。

@export var peg_positions: Array[Vector2] = []
