@tool
class_name HoldColorRule
extends Resource

## 保留色1色分の出現重み。当たり時/ハズレ時で別々の重みを持つのが業界標準
## (Phase -1リサーチ: 演出テーブルは当落で完全に分離している)。
## 実質信頼度 = weight_win / (weight_win + weight_lose)。

@export var color: HoldColor.Color = HoldColor.Color.WHITE
@export_range(0.0, 1000.0) var weight_win: float = 1.0
@export_range(0.0, 1000.0) var weight_lose: float = 1.0
