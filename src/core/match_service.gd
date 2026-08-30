extends Node
## MatchService: マッチ状態機械 (Lobby/Warmup/Live/RoundEnd/PostMatch) を管理する（Autoload）。
## 勝敗条件・スコア・リスポーンルールは各 GameMode 側が定義し、ここでは状態遷移のみを扱う。

var _state_machine: StateMachine


func _ready() -> void:
	_state_machine = StateMachine.new(&"lobby")
	_state_machine.define_transition(&"lobby", &"warmup")
	_state_machine.define_transition(&"warmup", &"live")
	_state_machine.define_transition(&"live", &"round_end")
	_state_machine.define_transition(&"round_end", &"live")
	_state_machine.define_transition(&"round_end", &"post_match")
	_state_machine.state_changed.connect(_on_state_changed)


func _on_state_changed(previous_state: StringName, new_state: StringName) -> void:
	GameEvents.match_state_changed.emit(previous_state, new_state)


func request_transition(target_state: StringName) -> bool:
	return _state_machine.transition_to(target_state)


func get_current_state() -> StringName:
	return _state_machine.get_current_state()
