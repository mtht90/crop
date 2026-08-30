class_name MovementComponent extends Node
## 加速/減速/空中制御/ダッシュを担う。実際の移動計算は Phase 2 で純粋関数
## MovementSimulation として分離実装し、このコンポーネントはその呼び出し口になる
## （クライアント予測との共有のため、ロジックの二重実装を禁止する）。

const TUNING: GameFeelTuning = preload("res://data/tuning/game_feel.tres")

var move_speed: float = 0.0


func initialize(new_move_speed: float) -> void:
	move_speed = new_move_speed
