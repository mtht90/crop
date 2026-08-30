class_name WeaponComponent extends Node
## 射撃・リロード・反動・スプレッドを担う。判定自体は FireMode ストラテジに委譲し、
## ダメージ確定はサーバー権威（第5.7章）。発射レート制限・弾数管理はここで一元管理する。

signal fired(shot_index_in_magazine: int)
signal reload_started
signal reload_finished
signal ammo_changed(current_ammo: int, magazine_size: int)
signal recoil_applied(recoil_offset: Vector2)
signal hit_confirmed(damage_info: DamageInfo)

const MAX_SPREAD_RADIANS: float = 0.08
const SPREAD_RECOVERY_SECONDS: float = 0.4

var weapon_data: WeaponData
var _fire_mode: FireMode
var _current_ammo: int = 0
var _time_since_last_shot: float = 999.0
var _is_reloading: bool = false
var _reload_elapsed_seconds: float = 0.0
var _spread_current: float = 0.0


func initialize(new_weapon_data: WeaponData) -> void:
	weapon_data = new_weapon_data
	_fire_mode = _create_fire_mode(new_weapon_data.fire_mode_type)
	_current_ammo = new_weapon_data.magazine_size
	ammo_changed.emit(_current_ammo, weapon_data.magazine_size)


func process_tick(
	delta: float,
	wants_fire: bool,
	muzzle_transform: Transform3D,
	space_state: PhysicsDirectSpaceState3D,
	shooter_hero_id: int
) -> void:
	_time_since_last_shot += delta
	_decay_spread(delta)

	if _is_reloading:
		_reload_elapsed_seconds += delta
		if _reload_elapsed_seconds >= weapon_data.reload_seconds:
			_finish_reload()
		return

	if wants_fire and _can_fire():
		_fire(muzzle_transform, space_state, shooter_hero_id)


func request_reload() -> void:
	if _is_reloading or _current_ammo >= weapon_data.magazine_size:
		return
	_is_reloading = true
	_reload_elapsed_seconds = 0.0
	reload_started.emit()


func get_current_ammo() -> int:
	return _current_ammo


func is_reloading() -> bool:
	return _is_reloading


func get_spread_radians() -> float:
	return _spread_current


func _create_fire_mode(fire_mode_type: WeaponData.FireModeType) -> FireMode:
	match fire_mode_type:
		WeaponData.FireModeType.PROJECTILE:
			return ProjectileFireMode.new()
		WeaponData.FireModeType.BEAM:
			return BeamFireMode.new()
		_:
			return HitscanFireMode.new()


func _finish_reload() -> void:
	_is_reloading = false
	_current_ammo = weapon_data.magazine_size
	ammo_changed.emit(_current_ammo, weapon_data.magazine_size)
	reload_finished.emit()


func _can_fire() -> bool:
	var min_interval_seconds: float = 1.0 / weapon_data.fire_rate_rounds_per_second
	return _current_ammo > 0 and _time_since_last_shot >= min_interval_seconds


func _fire(
	muzzle_transform: Transform3D, space_state: PhysicsDirectSpaceState3D, shooter_hero_id: int
) -> void:
	_time_since_last_shot = 0.0
	var shot_index: int = weapon_data.magazine_size - _current_ammo
	_current_ammo -= 1
	ammo_changed.emit(_current_ammo, weapon_data.magazine_size)

	recoil_applied.emit(_sample_recoil(shot_index))

	var spread_radians: float = _spread_current
	_spread_current = minf(_spread_current + weapon_data.recoil_random_factor, MAX_SPREAD_RADIANS)
	var fire_transform: Transform3D = _apply_spread(muzzle_transform, spread_radians)

	if _fire_mode is HitscanFireMode:
		var damage_info: DamageInfo = (_fire_mode as HitscanFireMode).fire_hitscan(
			weapon_data, fire_transform, space_state, shooter_hero_id
		)
		if damage_info != null:
			hit_confirmed.emit(damage_info)
	else:
		_fire_mode.fire(weapon_data, fire_transform)

	fired.emit(shot_index)


func _sample_recoil(shot_index: int) -> Vector2:
	if weapon_data.recoil_pattern == null or weapon_data.recoil_pattern.point_count == 0:
		return Vector2.ZERO
	var sample_index: int = mini(shot_index, weapon_data.recoil_pattern.point_count - 1)
	return weapon_data.recoil_pattern.get_point_position(sample_index)


func _apply_spread(muzzle_transform: Transform3D, spread_radians: float) -> Transform3D:
	if spread_radians <= 0.0:
		return muzzle_transform
	var random_yaw: float = randf_range(-spread_radians, spread_radians)
	var random_pitch: float = randf_range(-spread_radians, spread_radians)
	var spread_basis: Basis = muzzle_transform.basis.rotated(muzzle_transform.basis.y, random_yaw)
	spread_basis = spread_basis.rotated(spread_basis.x, random_pitch)
	return Transform3D(spread_basis, muzzle_transform.origin)


func _decay_spread(delta: float) -> void:
	var recovery_rate: float = 1.0 / SPREAD_RECOVERY_SECONDS
	_spread_current = maxf(0.0, _spread_current - recovery_rate * delta)
