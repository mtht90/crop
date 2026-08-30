class_name GameModeBase extends Node
## 全ゲームモード共通の状態機械 (Warmup → Live → RoundEnd → 次ラウンド|PostMatch)。
## 勝敗条件・スコア・リスポーンルールはモード側（TdmMode/CrystalAssaultMode）が定義し、
## HeroBase や UI はどのモードが動作しているかを一切知らない（第6.1章）。

signal round_started(round_number: int)
signal round_ended(winning_team_id: int)
signal match_ended(winning_team_id: int)

var _state_machine: StateMachine
var _round_number: int = 0


func _ready() -> void:
	_state_machine = StateMachine.new(&"warmup")
	_state_machine.define_transition(&"warmup", &"live")
	_state_machine.define_transition(&"live", &"round_end")
	_state_machine.define_transition(&"round_end", &"live")
	_state_machine.define_transition(&"round_end", &"post_match")


func start_round() -> void:
	if not _state_machine.transition_to(&"live"):
		return
	_round_number += 1
	round_started.emit(_round_number)


func end_round(winning_team_id: int) -> void:
	if not _state_machine.transition_to(&"round_end"):
		return
	round_ended.emit(winning_team_id)


func end_match(winning_team_id: int) -> void:
	if not _state_machine.transition_to(&"post_match"):
		return
	match_ended.emit(winning_team_id)


func get_current_state() -> StringName:
	return _state_machine.get_current_state()


func get_round_number() -> int:
	return _round_number


## 勝敗判定はサブクラスが実装する。継承ではなく差し替え可能なチェックとして
## オーバーライドさせるが、ここでは「呼び出し規約」のみを定義する。
func check_win_condition() -> int:
	push_error("GameModeBase.check_win_condition() はサブクラスでオーバーライドしてください。")
	return -1
