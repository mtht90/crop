class_name DamageFalloff extends RefCounted
## 距離減衰の計算を行う純粋関数（第3.3章 DamageInfo の距離情報を活かす）。
## falloff_start_meters までは満タンのダメージ、falloff_end_meters で
## min_multiplier まで線形に減衰する。

static func compute_multiplier(
	distance_meters: float,
	falloff_start_meters: float,
	falloff_end_meters: float,
	min_multiplier: float
) -> float:
	if distance_meters <= falloff_start_meters:
		return 1.0
	if distance_meters >= falloff_end_meters:
		return min_multiplier
	var falloff_range: float = falloff_end_meters - falloff_start_meters
	if falloff_range <= 0.0:
		return min_multiplier
	var progress_ratio: float = (distance_meters - falloff_start_meters) / falloff_range
	return lerpf(1.0, min_multiplier, progress_ratio)
