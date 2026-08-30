class_name TeamComponent extends Node
## 陣営とフレンドリーファイア判定を担う。

var team_id: int = -1


func initialize(new_team_id: int) -> void:
	team_id = new_team_id


func is_ally_of(other: TeamComponent) -> bool:
	return team_id == other.team_id
