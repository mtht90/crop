class_name HoldSlot
extends RefCounted

## 保留1個分。入賞時点で確定させたLotteryResultを、変動が消化されるまで保持する。

var lottery_result: LotteryResult

func _init(p_lottery_result: LotteryResult) -> void:
	lottery_result = p_lottery_result
