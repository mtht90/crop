class_name EffectSelector
extends RefCounted

## 演出選択(サブ基板相当)。必ず確定済みのLotteryResultを受け取ってから演出を選ぶ。
## 抽選結果を変更したり、演出の都合で当落を決め直すことは構造上できない
## (LotteryResultはLotterySystem以外どこからも書き換えられない)。

var table: EffectTable
var rng: RandomNumberGenerator

func _init(p_table: EffectTable, seed_value: int = -1) -> void:
	table = p_table
	rng = RandomNumberGenerator.new()
	if seed_value >= 0:
		rng.seed = seed_value
	else:
		rng.randomize()

func pick(result: LotteryResult) -> EffectDef:
	return table.draw(result.is_jackpot, rng)

func reliability_percent(effect: EffectDef) -> float:
	return table.reliability_percent(effect)
