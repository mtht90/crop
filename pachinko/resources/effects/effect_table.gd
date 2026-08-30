@tool
class_name EffectTable
extends Resource

@export var effects: Array[EffectDef] = []

func draw(is_jackpot: bool, rng: RandomNumberGenerator) -> EffectDef:
	var total: float = 0.0
	for effect in effects:
		total += effect.weight_win if is_jackpot else effect.weight_lose
	if total <= 0.0 or effects.is_empty():
		return null

	var roll: float = rng.randf() * total
	var cumulative: float = 0.0
	for effect in effects:
		cumulative += effect.weight_win if is_jackpot else effect.weight_lose
		if roll < cumulative:
			return effect
	return effects[effects.size() - 1]

func reliability_percent(effect: EffectDef) -> float:
	if effect == null:
		return 0.0
	var denom: float = effect.weight_win + effect.weight_lose
	if denom <= 0.0:
		return 0.0
	return (effect.weight_win / denom) * 100.0
