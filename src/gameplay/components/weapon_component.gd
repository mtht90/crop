class_name WeaponComponent extends Node
## 射撃・リロード・反動・スプレッドを担う。FireMode ストラテジへの委譲は Phase 3 で実装する。

var weapon_data: WeaponData
var _fire_mode: FireMode


func initialize(new_weapon_data: WeaponData) -> void:
	weapon_data = new_weapon_data
