class_name CrystalAssaultMode extends GameModeBase
## 中央の占領ポイントを奪い合うモード。占領進行度はサーバー計算し、
## 人数差で加速する（第6.3章）。UI 側は進行度を補間表示する想定。

const CONFIG: CrystalAssaultConfig = preload("res://data/tuning/crystal_assault_config.tres")

signal capture_progress_changed(progress_ratio: float, capturing_team_id: int)
signal point_captured(capturing_team_id: int)

var _progress_ratio: float = 0.0
var _capturing_team_id: int = -1


## attacker_count が 0 なら進行しない。防衛側が同時にいる場合の押し戻しは
## Phase 5 の残作業（複数チーム同時在圏の相殺ルール）として扱う。
func advance_capture(delta: float, attacker_team_id: int, attacker_count: int) -> void:
	if attacker_count <= 0:
		return
	if _capturing_team_id != attacker_team_id:
		_capturing_team_id = attacker_team_id
		_progress_ratio = 0.0

	var multiplier: float = _rate_multiplier_for(attacker_count)
	var rate_per_second: float = multiplier / CONFIG.capture_seconds_at_one_attacker
	_progress_ratio = minf(1.0, _progress_ratio + rate_per_second * delta)
	capture_progress_changed.emit(_progress_ratio, _capturing_team_id)

	if _progress_ratio >= 1.0:
		point_captured.emit(_capturing_team_id)


func get_progress_ratio() -> float:
	return _progress_ratio


func get_capturing_team_id() -> int:
	return _capturing_team_id


func _rate_multiplier_for(attacker_count: int) -> float:
	var clamped_index: int = clampi(
		attacker_count, 0, CONFIG.capture_rate_multiplier_by_attacker_count.size() - 1
	)
	return CONFIG.capture_rate_multiplier_by_attacker_count[clamped_index]
