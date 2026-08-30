class_name TeamAssignment extends RefCounted
## 3v3 のチーム割り当て・バランス調整を行う純粋ロジック（第6章）。
## 常に人数の少ないチームへ割り当てることで、離脱者が出た場合の
## 補充も自然に均衡させる。

const TEAM_SIZE: int = 3
const TEAM_COUNT: int = 2

var _team_members: Dictionary = {} ## int team_id -> Array[int] peer_ids


func _init() -> void:
	for team_id: int in range(TEAM_COUNT):
		_team_members[team_id] = [] as Array[int]


## 最も人数の少ないチームに割り当てる。同数の場合はチームIDが小さい方を優先する。
## 両チームが満員（TEAM_SIZE ずつ）なら -1 を返す。
func assign_player(peer_id: int) -> int:
	var target_team_id: int = -1
	var smallest_team_size: int = TEAM_SIZE + 1
	for team_id: int in range(TEAM_COUNT):
		var members: Array[int] = _team_members[team_id]
		if members.size() >= TEAM_SIZE:
			continue
		if members.size() < smallest_team_size:
			smallest_team_size = members.size()
			target_team_id = team_id

	if target_team_id == -1:
		return -1

	_team_members[target_team_id].append(peer_id)
	return target_team_id


func remove_player(peer_id: int) -> void:
	for team_id: int in range(TEAM_COUNT):
		(_team_members[team_id] as Array[int]).erase(peer_id)


func get_team_members(team_id: int) -> Array[int]:
	return _team_members.get(team_id, [] as Array[int])


func is_match_full() -> bool:
	for team_id: int in range(TEAM_COUNT):
		if (_team_members[team_id] as Array[int]).size() < TEAM_SIZE:
			return false
	return true
