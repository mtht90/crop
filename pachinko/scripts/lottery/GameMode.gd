class_name GameMode
extends RefCounted

## ゲーム状態(確率モード)の列挙。GameState/LotteryResult双方から参照する共有定義。
enum Mode {
	NORMAL,          ## 通常時
	TIME_SHORT,      ## 時短中(通常確率のまま変動時間のみ短縮)
	PROBABILITY_ZONE ## 確変中(高確率)
}
