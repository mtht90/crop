class_name LotteryResult
extends RefCounted

## 1回の変動に対応する「結果先決め」データ。保留に入賞した瞬間に確定させ、
## 変動が実際に消化されるまでそのまま保持する(Phase -1リサーチの処理順序原則)。

var is_jackpot: bool = false
var jackpot_type: JackpotTypeDef = null
var enters_probability_zone: bool = false
var drawn_in_mode: GameMode.Mode = GameMode.Mode.NORMAL
