@tool
class_name EffectDef
extends Resource

## 1回の変動で選ばれ得る演出パターン1つ分の定義。
## 「発生条件」は当落(weight_win/weight_lose)そのものであり、Phase -1リサーチの
## 「当たり時演出テーブル/ハズレ時演出テーブルは別」という原則をそのままデータ化している。

@export var id: String = ""
@export var display_name: String = ""
@export_multiline var description: String = ""
@export_range(0.0, 1000.0) var weight_win: float = 1.0
## 0にすると「大当たり時にしか選ばれない演出」= プレミア演出(信頼度100%)になる。
@export_range(0.0, 1000.0) var weight_lose: float = 1.0
