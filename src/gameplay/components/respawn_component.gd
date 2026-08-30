class_name RespawnComponent extends Node
## リスポーン後の無敵時間を管理する（第6.4章: 復帰時1.5秒の無敵、無敵中は攻撃不可）。
## 視覚表現（フレネル+スキャンラインのディゾルブシェーダー）は Presentation 層が
## invulnerability_started/invulnerability_ended シグナルを購読して行う。

signal invulnerability_started(duration_seconds: float)
signal invulnerability_ended

const INVULNERABILITY_DURATION_SECONDS: float = 1.5

var _invulnerability_remaining_seconds: float = 0.0


func start_invulnerability() -> void:
	_invulnerability_remaining_seconds = INVULNERABILITY_DURATION_SECONDS
	invulnerability_started.emit(INVULNERABILITY_DURATION_SECONDS)


func is_invulnerable() -> bool:
	return _invulnerability_remaining_seconds > 0.0


func _process(delta: float) -> void:
	if _invulnerability_remaining_seconds <= 0.0:
		return
	_invulnerability_remaining_seconds = maxf(0.0, _invulnerability_remaining_seconds - delta)
	if _invulnerability_remaining_seconds <= 0.0:
		invulnerability_ended.emit()
