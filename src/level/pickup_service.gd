class_name PickupService extends RefCounted
## ピックアップ（回復/弾薬）の取得権威をサーバー側で一元管理する（第6.4章）。
## クライアントは取得確定後にのみ演出を再生し、先出し予測は行わない
## （取得の空振りは体験を壊すため）。

class PickupState extends RefCounted:
	var pickup_id: int
	var respawn_seconds: float
	var is_available: bool = true
	var _cooldown_remaining_seconds: float = 0.0


var _pickups: Dictionary = {} ## int pickup_id -> PickupState


func register_pickup(pickup_id: int, respawn_seconds: float) -> void:
	var state := PickupState.new()
	state.pickup_id = pickup_id
	state.respawn_seconds = respawn_seconds
	_pickups[pickup_id] = state


## 取得試行。成功したら true を返し、以後 respawn_seconds 経過するまで
## 再取得できなくなる。取得の可否はサーバーのみが判定する。
func try_consume(pickup_id: int) -> bool:
	if not _pickups.has(pickup_id):
		return false
	var state: PickupState = _pickups[pickup_id]
	if not state.is_available:
		return false
	state.is_available = false
	state._cooldown_remaining_seconds = state.respawn_seconds
	return true


func is_available(pickup_id: int) -> bool:
	if not _pickups.has(pickup_id):
		return false
	return _pickups[pickup_id].is_available


func advance_time(delta: float) -> void:
	for state: PickupState in _pickups.values():
		if state.is_available:
			continue
		state._cooldown_remaining_seconds = maxf(0.0, state._cooldown_remaining_seconds - delta)
		if state._cooldown_remaining_seconds <= 0.0:
			state.is_available = true
