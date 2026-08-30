class_name StateSnapshot extends RefCounted
## サーバーが全クライアントへ配信するワールド状態のスナップショット（第5.2章）。

var tick: int
var entities: Dictionary ## int peer_id -> EntityState


class EntityState extends RefCounted:
	var position: Vector3
	var velocity: Vector3
	var yaw: float
	var health: float
