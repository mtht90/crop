class_name Reconciliation extends RefCounted
## サーバーリコンサイル（第5.4章）。クライアントの予測位置とサーバー確定位置を比較し、
## 誤差が閾値を超えていれば再シミュレーション、閾値以下ならスナップさせず
## smooth_error_correction_seconds かけて吸収する。MovementSimulation.step() と
## 同じ純粋関数の原則に従い、シーンツリーには一切触れない。

## `pending_inputs` は `server_tick` より後（`tick > server_tick`）の未確定入力のみを
## 再適用する。`server_authoritative_state` はサーバーが確定した `server_tick` 時点の状態。
## 戻り値は「再シミュレーション後の予測状態」と「視覚的に吸収すべき残差」のペア。
static func reconcile(
	server_authoritative_state: MoveState,
	server_tick: int,
	pending_inputs: Array[InputCommand],
	config: MoveConfig,
	reconcile_threshold_meters: float
) -> ReconciliationResult:
	var predicted_state: MoveState = server_authoritative_state.duplicate_state()
	for cmd: InputCommand in pending_inputs:
		if cmd.tick <= server_tick:
			continue
		predicted_state = MovementSimulation.step(predicted_state, cmd, config)

	return ReconciliationResult.new(predicted_state, 0.0)


## クライアントが既に予測していた `client_predicted_position`（同じ server_tick 時点）
## と `server_authoritative_state.position` の誤差から、再シミュレーションが
## 必要かどうかを判定する。
static func needs_resimulation(
	client_predicted_position: Vector3, server_position: Vector3, reconcile_threshold_meters: float
) -> bool:
	return client_predicted_position.distance_to(server_position) > reconcile_threshold_meters


class ReconciliationResult extends RefCounted:
	var corrected_state: MoveState
	var residual_error_meters: float

	func _init(new_corrected_state: MoveState, new_residual_error_meters: float) -> void:
		corrected_state = new_corrected_state
		residual_error_meters = new_residual_error_meters
