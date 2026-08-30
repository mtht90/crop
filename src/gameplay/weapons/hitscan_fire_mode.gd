class_name HitscanFireMode extends FireMode
## サーバー権威のヒットスキャン判定。クライアントは即座に演出だけ再生し、
## サーバー否認時は演出を消さずダメージだけ発生しない設計とする（第4.4章）。
## 演出側の否認処理は Phase 4 のネットワーク層で実装する。

const MAX_RANGE_METERS: float = 200.0


func fire(_weapon_data: WeaponData, _origin_transform: Transform3D) -> void:
	push_error("HitscanFireMode.fire() ではなく fire_hitscan() を使用してください。")


func fire_hitscan(
	weapon_data: WeaponData,
	origin_transform: Transform3D,
	space_state: PhysicsDirectSpaceState3D,
	shooter_hero_id: int
) -> DamageInfo:
	var ray_origin: Vector3 = origin_transform.origin
	var ray_end: Vector3 = ray_origin - origin_transform.basis.z * MAX_RANGE_METERS
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(ray_origin, ray_end)
	var result: Dictionary = space_state.intersect_ray(query)
	if result.is_empty():
		return null

	var hero: HeroBase = _find_hero_base(result["collider"] as Node)
	if hero == null:
		return null
	if hero.get_respawn_component().is_invulnerable():
		return null

	var distance_meters: float = ray_origin.distance_to(result["position"])
	var falloff_multiplier: float = DamageFalloff.compute_multiplier(
		distance_meters,
		weapon_data.damage_falloff_start_meters,
		weapon_data.damage_falloff_end_meters,
		weapon_data.damage_falloff_min_multiplier
	)
	var damage_info := DamageInfo.new(
		shooter_hero_id,
		weapon_data.damage_per_hit * falloff_multiplier,
		&"ballistic",
		&"body",
		distance_meters
	)
	hero.get_health_component().apply_damage(damage_info)
	return damage_info


func _find_hero_base(node: Node) -> HeroBase:
	var current: Node = node
	while current != null:
		if current is HeroBase:
			return current as HeroBase
		current = current.get_parent()
	return null
