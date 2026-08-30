@tool
class_name JackpotTypeDef
extends Resource

## 大当たり種別1つ分の定義。ScriptableObject相当のGodot Resource。

@export var id: String = ""
@export var display_name: String = ""
@export_range(1, 32) var rounds: int = 4
## 大当たり種別抽選での相対重み(絶対確率ではない)
@export_range(0.0, 100.0) var weight: float = 1.0
## この種別に当選した場合に確変(高確率状態)へ突入する確率(0.0〜1.0)。
## 昇格演出等で"あとから見せる"としても、内部的な当落自体は大当たり確定と同時に決定する
## (Phase -1リサーチの「結果先決め」原則に従う)。
@export_range(0.0, 1.0, 0.01) var probability_zone_entry_chance: float = 0.5
