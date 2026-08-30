class_name NetworkComponent extends Node
## クライアント予測の入力バッファとサーバーリコンサイルの起点を担う（第5.3/5.4章）。
## 実際の RPC 送受信（InputCommand の送信、StateSnapshot の受信）は Phase 4 の
## 残作業として NetService 経由で配線する。ここでは配線先となる純粋なバッファ管理と
## リコンサイル判定のみを扱う（MovementSimulation/Reconciliation との二重実装を禁止）。

const MAX_PENDING_INPUT_SECONDS: float = 2.0

var pending_inputs: Array[InputCommand] = []
var _last_resimulation_count: int = 0


func record_input(cmd: InputCommand) -> void:
	pending_inputs.append(cmd)
	_trim_pending_inputs()


func acknowledge_up_to_tick(acknowledged_tick: int) -> void:
	pending_inputs = pending_inputs.filter(
		func(cmd: InputCommand) -> bool: return cmd.tick > acknowledged_tick
	)


## サーバーから受け取った server_tick 時点の確定状態と、同時刻のクライアント予測位置を
## 比較し、閾値を超えていれば再シミュレーション後の状態を返す。閾値以下なら null を返し、
## 呼び出し側は現在の予測状態をそのまま使ってよい（第5.4章の smooth error correction は
## 視覚表現側で別途吸収する）。
func reconcile_with_server(
	predicted_position_at_server_tick: Vector3,
	server_state: MoveState,
	server_tick: int,
	config: MoveConfig,
	reconcile_threshold_meters: float
) -> MoveState:
	acknowledge_up_to_tick(server_tick)
	var needs_resimulation: bool = Reconciliation.needs_resimulation(
		predicted_position_at_server_tick, server_state.position, reconcile_threshold_meters
	)
	if not needs_resimulation:
		_last_resimulation_count = 0
		return null

	var result: Reconciliation.ReconciliationResult = Reconciliation.reconcile(
		server_state, server_tick, pending_inputs, config, reconcile_threshold_meters
	)
	_last_resimulation_count = pending_inputs.size()
	return result.corrected_state


func get_last_resimulation_count() -> int:
	return _last_resimulation_count


func _trim_pending_inputs() -> void:
	if pending_inputs.is_empty():
		return
	var newest_delta: float = pending_inputs[-1].delta
	var max_ticks: int = int(MAX_PENDING_INPUT_SECONDS / maxf(newest_delta, 0.001))
	while pending_inputs.size() > max_ticks:
		pending_inputs.pop_front()
