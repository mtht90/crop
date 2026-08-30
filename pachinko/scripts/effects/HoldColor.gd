class_name HoldColor
extends RefCounted

## 保留(先読み)の警告ランプ色階梯。docs/phase0-worldview.md の「保留色の意味づけ」に対応。
## 列挙型名は"Color"ではなく"Tier"にしている。GodotにはColor(RGBA)という組み込み型が
## 既に存在するため、"HoldColor.Color"という参照はエンジン側のColor型と名前が衝突し、
## パーサが解決できずに "Could not resolve external class member" エラーになる。
enum Tier {
	WHITE,
	BLUE,
	GREEN,
	RED,
	GOLD,
	RAINBOW,
}

static func display_name(tier: Tier) -> String:
	match tier:
		Tier.WHITE:
			return "白(通常監視)"
		Tier.BLUE:
			return "青(索敵警戒)"
		Tier.GREEN:
			return "緑(準備配置)"
		Tier.RED:
			return "赤(戦闘配置警告)"
		Tier.GOLD:
			return "金(全艦臨戦態勢)"
		Tier.RAINBOW:
			return "虹(富岳、覚醒条件充足)"
		_:
			return "?"
