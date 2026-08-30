class_name HoldColor
extends RefCounted

## 保留(先読み)の警告ランプ色階梯。docs/phase0-worldview.md の「保留色の意味づけ」に対応。
enum Color {
	WHITE,
	BLUE,
	GREEN,
	RED,
	GOLD,
	RAINBOW,
}

static func display_name(color: Color) -> String:
	match color:
		Color.WHITE:
			return "白(通常監視)"
		Color.BLUE:
			return "青(索敵警戒)"
		Color.GREEN:
			return "緑(準備配置)"
		Color.RED:
			return "赤(戦闘配置警告)"
		Color.GOLD:
			return "金(全艦臨戦態勢)"
		Color.RAINBOW:
			return "虹(富岳、覚醒条件充足)"
		_:
			return "?"
