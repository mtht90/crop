class_name RespawnFlow extends RefCounted
## 死亡 → キルカメラ → チームスポーン地点からの復帰、という第6.2/6.4章の
## リスポーンフローを状態機械として表現する。実際の画面遷移（ブラックフェード等）は
## Presentation 層がこのシグナル/状態を購読して行う。

signal kill_cam_started(killer_hero_id: int)
signal respawned

const KILL_CAM_DURATION_SECONDS: float = 3.0

var _state_machine: StateMachine
var _kill_cam_elapsed_seconds: float = 0.0
var _killer_hero_id: int = -1


func _init() -> void:
	_state_machine = StateMachine.new(&"alive")
	_state_machine.define_transition(&"alive", &"kill_cam")
	_state_machine.define_transition(&"kill_cam", &"alive")


func handle_death(killer_hero_id: int) -> void:
	if not _state_machine.transition_to(&"kill_cam"):
		return
	_kill_cam_elapsed_seconds = 0.0
	_killer_hero_id = killer_hero_id
	kill_cam_started.emit(killer_hero_id)


func advance(delta: float) -> void:
	if _state_machine.get_current_state() != &"kill_cam":
		return
	_kill_cam_elapsed_seconds += delta
	if _kill_cam_elapsed_seconds >= KILL_CAM_DURATION_SECONDS:
		_state_machine.transition_to(&"alive")
		respawned.emit()


func get_current_state() -> StringName:
	return _state_machine.get_current_state()


func get_killer_hero_id() -> int:
	return _killer_hero_id
