class_name UltimateChargeComponent extends Node
## ウルトゲージをサーバー側で厳密に計算する。与ダメ・被ダメ・時間経過の3系統からの
## 加算は Phase 3 で実装し、係数はすべてデータ化する。

signal ultimate_ready

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


func is_ready() -> bool:
	return _current_charge >= _required_charge


func consume() -> void:
	_current_charge = 0.0
