class_name AbilityData extends Resource
## 能力のデータ定義。実行ロジックは execution_scene の Node 側が持ち、
## このリソース自体はパラメータのみを保持する（第3.2/3.3章）。

@export var ability_id: StringName = &""
@export var display_name: String = ""
@export var cooldown_seconds: float = 8.0
@export var resource_cost: float = 0.0
@export var execution_scene: PackedScene
