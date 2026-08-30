class_name LotterySystem
extends RefCounted

## 内部抽選(主基板相当)。演出選択(サブ基板相当)は一切知らない・関与しない。
## Phase -1リサーチ原則: 「結果を先に確定させ、演出はあとから選ぶ」を守るため、
## LotterySystemは常にHold入賞時点で1回だけ呼ばれ、結果はLotteryResultとして
## 保留に保存される。演出テーブル(Phase4)はこの確定済み結果を後から参照するだけで、
## 逆に演出側から抽選結果を書き換えることは出来ない設計にする。

var table: ProbabilityTable
var rng: RandomNumberGenerator

func _init(p_table: ProbabilityTable, seed_value: int = -1) -> void:
	table = p_table
	rng = RandomNumberGenerator.new()
	if seed_value >= 0:
		rng.seed = seed_value
	else:
		rng.randomize()

func draw(current_mode: GameMode.Mode) -> LotteryResult:
	var denominator: int = table.normal_jackpot_denominator
	if current_mode == GameMode.Mode.PROBABILITY_ZONE:
		denominator = table.high_jackpot_denominator

	var result := LotteryResult.new()
	result.drawn_in_mode = current_mode
	result.is_jackpot = rng.randi_range(1, denominator) == 1

	if result.is_jackpot:
		var jt := table.draw_jackpot_type(rng)
		result.jackpot_type = jt
		if jt != null:
			result.enters_probability_zone = rng.randf() < jt.probability_zone_entry_chance

	return result
