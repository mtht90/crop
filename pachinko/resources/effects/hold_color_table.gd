@tool
class_name HoldColorTable
extends Resource

@export var rules: Array[HoldColorRule] = []

func draw(is_jackpot: bool, rng: RandomNumberGenerator) -> HoldColor.Color:
	var total: float = 0.0
	for rule in rules:
		total += rule.weight_win if is_jackpot else rule.weight_lose
	if total <= 0.0 or rules.is_empty():
		return HoldColor.Color.WHITE

	var roll: float = rng.randf() * total
	var cumulative: float = 0.0
	for rule in rules:
		cumulative += rule.weight_win if is_jackpot else rule.weight_lose
		if roll < cumulative:
			return rule.color
	return rules[rules.size() - 1].color

## デバッグ表示・検証用: この色が実際に出た場合の当たり確率(%)を返す。
func reliability_percent(color: HoldColor.Color) -> float:
	for rule in rules:
		if rule.color == color:
			var denom: float = rule.weight_win + rule.weight_lose
			if denom <= 0.0:
				return 0.0
			return (rule.weight_win / denom) * 100.0
	return 0.0
