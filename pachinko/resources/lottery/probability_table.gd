@tool
class_name ProbabilityTable
extends Resource

## 確率設計をまとめたテーブル。3.2節の仮パラメータに対応する。
## シード固定のRNGと組み合わせて使うことでテスト可能な抽選にする(LotterySystem参照)。

## 通常時の大当たり確率の分母(例: 1/319 → 319)
@export_range(1, 2000) var normal_jackpot_denominator: int = 319
## 確変中の大当たり確率の分母(例: 1/99 → 99)
@export_range(1, 2000) var high_jackpot_denominator: int = 99
## 時短回数
@export_range(1, 300) var time_short_count: int = 100
## 大当たり時に選ばれる種別(ラウンド数・確変突入率)の一覧
@export var jackpot_types: Array[JackpotTypeDef] = []

func total_weight() -> float:
	var total: float = 0.0
	for jt in jackpot_types:
		total += jt.weight
	return total

## 重み付き抽選で大当たり種別を1つ選ぶ。jackpot_typesが空の場合はnullを返す。
func draw_jackpot_type(rng: RandomNumberGenerator) -> JackpotTypeDef:
	if jackpot_types.is_empty():
		return null
	var total: float = total_weight()
	if total <= 0.0:
		return jackpot_types[0]
	var roll: float = rng.randf() * total
	var cumulative: float = 0.0
	for jt in jackpot_types:
		cumulative += jt.weight
		if roll < cumulative:
			return jt
	return jackpot_types[jackpot_types.size() - 1]
