class_name GameState
extends RefCounted

## 確率モード(通常/時短/確変)と付随カウンタを保持する。

signal mode_changed(new_mode: GameMode.Mode)

var mode: GameMode.Mode = GameMode.Mode.NORMAL
var time_short_remaining: int = 0
var total_payout_balls: int = 0

func set_mode(new_mode: GameMode.Mode) -> void:
	if mode == new_mode:
		return
	mode = new_mode
	mode_changed.emit(new_mode)

## 大当たりに当選しなかった変動を1回消化した時に呼ぶ。時短の残り回数を減らし、
## 0になれば通常時へ復帰する。確変中(回数無制限のST仕様)はここでは減算しない。
func on_spin_resolved_without_jackpot() -> void:
	if mode == GameMode.Mode.TIME_SHORT:
		time_short_remaining -= 1
		if time_short_remaining <= 0:
			set_mode(GameMode.Mode.NORMAL)

## 大当たり終了後の状態遷移。確変突入なら確変へ、そうでなければ時短へ移行する。
func apply_jackpot_result(entered_probability_zone: bool, time_short_count: int) -> void:
	if entered_probability_zone:
		set_mode(GameMode.Mode.PROBABILITY_ZONE)
		time_short_remaining = 0
	else:
		time_short_remaining = time_short_count
		set_mode(GameMode.Mode.TIME_SHORT)
