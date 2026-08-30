class_name HoldColorSelector
extends RefCounted

## 保留(先読み)色の抽選。LotterySystemとは別のRNGストリームを使うことで
## 互いの抽選が影響し合わないようにする(ただしどちらもシード指定で再現可能)。

var table: HoldColorTable
var rng: RandomNumberGenerator

func _init(p_table: HoldColorTable, seed_value: int = -1) -> void:
	table = p_table
	rng = RandomNumberGenerator.new()
	if seed_value >= 0:
		rng.seed = seed_value
	else:
		rng.randomize()

func pick(result: LotteryResult) -> HoldColor.Tier:
	return table.draw(result.is_jackpot, rng)
