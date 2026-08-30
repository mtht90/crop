extends Node2D

## 盤面全体のゲームループ:
## 玉発射→釘反射→始動チャッカー入賞(結果先決め)→保留→変動消化→大当たり判定/ラウンド管理
## 演出(リーチ/SPリーチ/カットイン等)はPhase4で本実装する。ここではロジックのみを
## デバッグラベルで可視化する。

const MAX_HOLD: int = HoldQueue.MAX_SIZE

@export var probability_table: ProbabilityTable = preload("res://resources/lottery/default_probability_table.tres")
@export var hold_color_table: HoldColorTable = preload("res://resources/effects/default_hold_color_table.tres")
@export var effect_table: EffectTable = preload("res://resources/effects/default_effect_table.tres")
## -1ならランダムシード。固定値を入れると抽選結果を再現可能にできる(3.2節の要件)。
## 保留色/演出選択はここから+1/+2したシードを使い、内部抽選と独立したRNGストリームにする。
@export var lottery_seed: int = -1

@onready var launcher: Node2D = $Launcher
@onready var start_chucker: Area2D = $Board/StartChucker
@onready var debug_label: Label = $UI/DebugLabel
@onready var spin_controller: SpinController = $SpinController
@onready var jackpot_controller: JackpotController = $JackpotController

var game_state: GameState
var lottery_system: LotterySystem
var hold_queue: HoldQueue
var hold_color_selector: HoldColorSelector
var effect_selector: EffectSelector

var total_launched: int = 0
var total_entered: int = 0
var last_result_text: String = "-"
var round_status_text: String = ""
var last_effect_text: String = "-"

func _ready() -> void:
	game_state = GameState.new()
	lottery_system = LotterySystem.new(probability_table, lottery_seed)
	hold_queue = HoldQueue.new()
	var color_seed: int = lottery_seed + 1 if lottery_seed >= 0 else -1
	var effect_seed: int = lottery_seed + 2 if lottery_seed >= 0 else -1
	hold_color_selector = HoldColorSelector.new(hold_color_table, color_seed)
	effect_selector = EffectSelector.new(effect_table, effect_seed)

	spin_controller.configure(hold_queue)
	jackpot_controller.configure(game_state, probability_table, spin_controller)

	start_chucker.entered.connect(_on_chucker_entered)
	game_state.mode_changed.connect(_on_mode_changed)
	spin_controller.spin_started.connect(_on_spin_started)
	spin_controller.spin_resolved.connect(_on_spin_resolved)
	jackpot_controller.round_started.connect(_on_round_started)
	jackpot_controller.round_finished.connect(_on_round_finished)
	jackpot_controller.jackpot_finished.connect(_on_jackpot_finished)

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
	if not hold_queue.is_full():
		# 結果先決め: 入賞した瞬間のモードで抽選し、変動が来るまで結果を保留に保存する。
		var result: LotteryResult = lottery_system.draw(game_state.mode)
		var slot := HoldSlot.new(result)
		# 保留色(先読み予告)も同じ「結果確定後に選ぶ」原則で、確定済みresultから決める。
		slot.hold_color = hold_color_selector.pick(result)
		hold_queue.try_enqueue(slot)
	_update_debug_label()

func _on_mode_changed(_new_mode: GameMode.Mode) -> void:
	_update_debug_label()

func _on_spin_started(result: LotteryResult) -> void:
	last_result_text = "変動中..."
	var effect: EffectDef = effect_selector.pick(result)
	if effect != null:
		var reliability: float = effect_selector.reliability_percent(effect)
		last_effect_text = "%s (信頼度%.1f%%)" % [effect.display_name, reliability]
	else:
		last_effect_text = "-"
	_update_debug_label()

func _on_spin_resolved(result: LotteryResult) -> void:
	last_result_text = "大当たり!" if result.is_jackpot else "ハズレ"
	jackpot_controller.handle_spin_resolved(result)
	_update_debug_label()

func _on_round_started(round_index: int, total_rounds: int) -> void:
	round_status_text = "R%d/%d 消化中" % [round_index, total_rounds]
	_update_debug_label()

func _on_round_finished(_round_index: int, _payout_balls: int) -> void:
	_update_debug_label()

func _on_jackpot_finished(result: LotteryResult) -> void:
	round_status_text = ""
	var zone_text: String = "確変突入" if result.enters_probability_zone else "時短突入"
	last_result_text = "大当たり終了(%s)" % zone_text
	_update_debug_label()

func _mode_display_name() -> String:
	match game_state.mode:
		GameMode.Mode.PROBABILITY_ZONE:
			return "確変中"
		GameMode.Mode.TIME_SHORT:
			return "時短中(残%d)" % game_state.time_short_remaining
		_:
			return "通常時"

func _hold_colors_text() -> String:
	if hold_queue == null or hold_queue.size() == 0:
		return "-"
	var names: Array[String] = []
	for slot in hold_queue.slots:
		names.append(HoldColor.display_name(slot.hold_color))
	return ", ".join(names)

func _update_debug_label() -> void:
	if debug_label == null:
		return
	var lines: PackedStringArray = [
		"発射数: %d  入賞数: %d  保留: %d/%d [%s]" % [
			total_launched, total_entered, hold_queue.size() if hold_queue else 0, MAX_HOLD,
			_hold_colors_text()
		],
		"状態: %s  獲得出玉: %d" % [_mode_display_name(), game_state.total_payout_balls if game_state else 0],
		"直近結果: %s  %s" % [last_result_text, round_status_text],
		"選択演出: %s" % last_effect_text,
	]
	debug_label.text = "\n".join(lines)
