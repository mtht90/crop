class_name HoldSlot
extends RefCounted

## 保留1個分。入賞時点で確定させたLotteryResultを、変動が消化されるまで保持する。

var lottery_result: LotteryResult
## 先読み予告として表示する保留色。GameManagerがHoldColorSelectorで決定して設定する。
var hold_color: HoldColor.Tier = HoldColor.Tier.WHITE

func _init(p_lottery_result: LotteryResult) -> void:
	lottery_result = p_lottery_result
