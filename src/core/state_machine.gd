class_name StateMachine extends RefCounted
## 汎用有限状態機械。許可された遷移のみを明示的に定義し、暗黙のフラグ乱立を防ぐ。

signal state_changed(previous_state: StringName, new_state: StringName)

var _current_state: StringName
var _allowed_transitions: Dictionary = {} ## StringName -> Array[StringName]


func _init(initial_state: StringName) -> void:
	_current_state = initial_state


func define_transition(from_state: StringName, to_state: StringName) -> void:
	if not _allowed_transitions.has(from_state):
		_allowed_transitions[from_state] = [] as Array[StringName]
	var targets: Array[StringName] = _allowed_transitions[from_state]
	if not targets.has(to_state):
		targets.append(to_state)


func can_transition_to(target_state: StringName) -> bool:
	if not _allowed_transitions.has(_current_state):
		return false
	var targets: Array[StringName] = _allowed_transitions[_current_state]
	return targets.has(target_state)


func transition_to(target_state: StringName) -> bool:
	if not can_transition_to(target_state):
		return false
	var previous_state: StringName = _current_state
	_current_state = target_state
	state_changed.emit(previous_state, target_state)
	return true


func get_current_state() -> StringName:
	return _current_state
