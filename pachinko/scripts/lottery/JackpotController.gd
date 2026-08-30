class_name JackpotController
extends Node

## 大当たり中のラウンド管理(3.1節ステップ7)。
## TODO(Phase4/6): 現状はラウンド時間・出玉を固定値で近似している。実機同様に
## 物理的なアタッカー(大入賞口)の開閉と実際の入賞球数で出玉を決めるようにするには、
## Board側にAttacker用のArea2Dとゲート開閉アニメーションを追加する必要がある。

signal jackpot_started(result: LotteryResult)
signal round_started(round_index: int, total_rounds: int)
signal round_finished(round_index: int, payout_balls: int)
signal jackpot_finished(result: LotteryResult)

@export var round_duration_sec: float = 1.5
@export var payout_per_round: int = 75

var game_state: GameState
var probability_table: ProbabilityTable
var spin_controller: SpinController

func configure(p_game_state: GameState, p_table: ProbabilityTable, p_spin_controller: SpinController) -> void:
	game_state = p_game_state
	probability_table = p_table
	spin_controller = p_spin_controller

func handle_spin_resolved(result: LotteryResult) -> void:
	if result.is_jackpot:
		_run_jackpot(result)
	else:
		game_state.on_spin_resolved_without_jackpot()

func _run_jackpot(result: LotteryResult) -> void:
	spin_controller.paused = true
	jackpot_started.emit(result)

	var total_rounds: int = 0
	if result.jackpot_type != null:
		total_rounds = result.jackpot_type.rounds

	for round_index in range(1, total_rounds + 1):
		round_started.emit(round_index, total_rounds)
		await get_tree().create_timer(round_duration_sec).timeout
		game_state.total_payout_balls += payout_per_round
		round_finished.emit(round_index, payout_per_round)

	game_state.apply_jackpot_result(result.enters_probability_zone, probability_table.time_short_count)
	jackpot_finished.emit(result)

	spin_controller.paused = false
	spin_controller.try_advance()
