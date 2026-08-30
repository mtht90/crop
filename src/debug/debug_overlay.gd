class_name DebugOverlay extends CanvasLayer
## 開発ビルド専用のデバッグオーバーレイ（速度・接地・FPS・フレームタイム・入力状態）。
## DebugService.debug_overlay_toggled を購読して表示/非表示を切り替える。
## 毎フレームの Performance 監視はデバッグ表示専用であり、第8.3章の HUD 予算
## （実プレイ用 HUD 0.5ms 以下）の対象外。

@onready var _label: Label = %DebugLabel

var tracked_hero: HeroBase


func _ready() -> void:
	visible = DebugService.is_overlay_visible()
	DebugService.debug_overlay_toggled.connect(_on_overlay_toggled)


func _on_overlay_toggled(is_overlay_visible: bool) -> void:
	visible = is_overlay_visible


func _process(_delta: float) -> void:
	if not visible:
		return
	var fps: int = Engine.get_frames_per_second()
	var frame_time_ms: float = (1000.0 / fps) if fps > 0 else 0.0

	var speed_text: String = "N/A"
	var grounded_text: String = "N/A"
	if tracked_hero != null:
		var movement_component: MovementComponent = tracked_hero.get_movement_component()
		var horizontal_speed: float = Vector2(
			movement_component.state.velocity.x, movement_component.state.velocity.z
		).length()
		speed_text = "%.2f m/s" % horizontal_speed
		grounded_text = "true" if movement_component.state.is_grounded else "false"

	_label.text = "FPS: %d\nFrame: %.2f ms\nSpeed: %s\nGrounded: %s" % [
		fps, frame_time_ms, speed_text, grounded_text
	]
