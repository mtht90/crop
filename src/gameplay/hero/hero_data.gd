class_name HeroData extends Resource
## ヒーロー1体を定義する唯一のデータソース。新ヒーローの追加はこの Resource を
## 1つ作成するだけで完結しなければならない（第3.2/3.3章）。HeroBase や既存コンポーネントの
## 改造が必要になった場合は設計が誤っている。

@export var hero_id: StringName = &""
@export var display_name: String = ""
@export var base_health: float = 100.0
@export var move_speed: float = 6.0
@export var acceleration: float = 12.0
@export var weapon_data: WeaponData
@export var ability_primary: AbilityData
@export var ability_ultimate: AbilityData
@export var ultimate_cost: float = 100.0
@export var hurtbox_radius: float = 0.4
@export var visual_scene: PackedScene
