class_name UltimateChargeComponent extends Node
## ウルトゲージをサーバー側で厳密に計算する。与ダメ・被ダメ・時間経過の3系統から
## 加算し、係数は UltimateChargeConfig（.tres）で完全にデータ化する（第4章）。

signal ultimate_ready

const CHARGE_CONFIG: UltimateChargeConfig = preload("res://data/tuning/ultimate_charge.tres")

var _current_charge: float = 0.0
var _required_charge: float = 0.0


func initialize(required_charge: float) -> void:
	_required_charge = required_charge
	_current_charge = 0.0


func add_charge(amount: float) -> void:
	if _current_charge >= _required_charge:
		return
	_current_charge = minf(_required_charge, _current_charge + amount)
	if _current_charge >= _required_charge:
		ultimate_ready.emit()


func on_damage_dealt(damage_amount: float) -> void:
	add_charge(damage_amount * CHARGE_CONFIG.charge_per_damage_dealt)


func on_damage_taken(damage_amount: float) -> void:
	add_charge(damage_amount * CHARGE_CONFIG.charge_per_damage_taken)


func _process(delta: float) -> void:
	add_charge(CHARGE_CONFIG.charge_per_second * delta)


func is_ready() -> bool:
	return _current_charge >= _required_charge


func consume() -> void:
	_current_charge = 0.0


func get_charge_ratio() -> float:
	return 0.0 if _required_charge <= 0.0 else _current_charge / _required_charge
