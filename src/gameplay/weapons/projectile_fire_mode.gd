class_name ProjectileFireMode extends FireMode
## 弾道落下を伴う実体弾の発射。クライアント側は fake projectile を即時生成し、
## サーバー確定後にハンドオフする（第4.4章）。実装は Phase 3 で行う。

func fire(_weapon_data: WeaponData, _origin_transform: Transform3D) -> void:
	pass
