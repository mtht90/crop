class_name SpinController
extends Node

## 変動フロー(3.1節ステップ4-5相当)。保留を1つ消化し、変動時間だけ待ってから結果を通知する。
## 変動中に選ばれる演出(リーチ/SPリーチ等)によって実際の変動時間は変わるべきだが、
## それはPhase4の演出テーブルの仕事なので、ここでは固定時間のプレースホルダーとする。

signal spin_started(result: LotteryResult)
signal spin_resolved(result: LotteryResult)

## TODO(Phase4): 演出選択の結果(リーチ有無・SPリーチ種別)に応じて可変にする
@export var spin_duration_sec: float = 3.0

var hold_queue: HoldQueue
var is_spinning: bool = false
var paused: bool = false

func configure(p_hold_queue: HoldQueue) -> void:
	hold_queue = p_hold_queue
	hold_queue.hold_added.connect(_on_hold_added)

func _on_hold_added(_count: int) -> void:
	try_advance()

func try_advance() -> void:
	if is_spinning or paused:
		return
	if hold_queue == null or hold_queue.size() == 0:
		return
	var slot: HoldSlot = hold_queue.dequeue()
	if slot == null:
		return
	is_spinning = true
	var result: LotteryResult = slot.lottery_result
	spin_started.emit(result)
	var timer: SceneTreeTimer = get_tree().create_timer(spin_duration_sec)
	timer.timeout.connect(_on_spin_timeout.bind(result))

func _on_spin_timeout(result: LotteryResult) -> void:
	is_spinning = false
	spin_resolved.emit(result)
	try_advance()
