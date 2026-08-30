class_name CrystalAssaultConfig extends Resource
## クリスタルアサルトの占領速度・勝敗条件データ（第6.3章）。人数差による
## 加速係数はここで完全にデータ化する（1人=1.0x, 2人=1.5x, 3人=1.8x の逓減）。

@export var capture_seconds_at_one_attacker: float = 10.0
@export var capture_rate_multiplier_by_attacker_count: Array[float] = [0.0, 1.0, 1.5, 1.8]
