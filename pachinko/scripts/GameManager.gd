extends Node2D

## Phase 1 最小盤面のゲームループ。玉発射→釘反射→始動チャッカー入賞→保留加算までを
## 実際に動く形で検証するためのプロトタイプ用マネージャー。
## 抽選ロジック・演出テーブルはPhase 3/4で本実装する。

const MAX_HOLD: int = 4

@onready var launcher: Node2D = $Launcher
@onready var start_chucker: Area2D = $Board/StartChucker
@onready var debug_label: Label = $UI/DebugLabel

var hold_count: int = 0
var total_launched: int = 0
var total_entered: int = 0

func _ready() -> void:
	start_chucker.entered.connect(_on_chucker_entered)
	_update_debug_label()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("launch_ball"):
		_fire()

func _fire() -> void:
	launcher.launch()
	total_launched += 1
	_update_debug_label()

func _on_chucker_entered(_ball: Node) -> void:
	total_entered += 1
	if hold_count < MAX_HOLD:
		hold_count += 1
	_update_debug_label()

func _update_debug_label() -> void:
	if debug_label == null:
		return
	debug_label.text = "発射数: %d  入賞数: %d  保留: %d/%d" % [
		total_launched, total_entered, hold_count, MAX_HOLD
	]
