class_name FireMode extends RefCounted
## WeaponComponent が委譲する発射ストラテジの基底クラス（第3.2章）。
## ヒーロー固有の分岐ではなく、武器の種別ごとにこのストラテジを差し替える。

func fire(_weapon_data: WeaponData, _origin_transform: Transform3D) -> void:
	push_error("FireMode.fire() はサブクラスでオーバーライドする必要があります。")
