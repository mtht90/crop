class_name TdmMode extends GameModeBase
## 3v3 チームデスマッチ。キル数上限または制限時間で勝敗を決める（第6.2章）。
## リスポーンは死亡 → respawn_delay_seconds 後にチームスポーン地点から復帰する
## （実際のタイマー駆動は Phase 5 の残作業として HeroBase 側と統合する）。

const CONFIG: TdmConfig = preload("res://data/tuning/tdm_config.tres")

signal kill_registered(team_id: int, team_kill_count: int)

var _kill_counts: Dictionary = {} ## int team_id -> int
var _elapsed_seconds: float = 0.0


func register_kill(killer_team_id: int) -> void:
	_kill_counts[killer_team_id] = _kill_counts.get(killer_team_id, 0) + 1
	kill_registered.emit(killer_team_id, _kill_counts[killer_team_id])


func get_kill_count(team_id: int) -> int:
	return _kill_counts.get(team_id, 0)


func advance_time(delta: float) -> void:
	_elapsed_seconds += delta


func check_win_condition() -> int:
	for team_id: int in _kill_counts.keys():
		if _kill_counts[team_id] >= CONFIG.kill_limit:
			return team_id
	if _elapsed_seconds >= CONFIG.time_limit_seconds:
		return _team_with_highest_kill_count()
	return -1


func _team_with_highest_kill_count() -> int:
	var leading_team_id: int = -1
	var leading_kill_count: int = -1
	for team_id: int in _kill_counts.keys():
		if _kill_counts[team_id] > leading_kill_count:
			leading_kill_count = _kill_counts[team_id]
			leading_team_id = team_id
	return leading_team_id
