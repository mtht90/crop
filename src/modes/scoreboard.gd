class_name Scoreboard extends RefCounted
## Tab スコアボード用のデータ集計（第6章）。Presentation 層はここから読み取るだけで、
## 集計ロジック自体は UI に依存しない。

class PlayerRecord extends RefCounted:
	var peer_id: int
	var team_id: int
	var kills: int = 0
	var deaths: int = 0
	var assists: int = 0


var _records: Dictionary = {} ## int peer_id -> PlayerRecord


func register_player(peer_id: int, team_id: int) -> void:
	if _records.has(peer_id):
		return
	var record := PlayerRecord.new()
	record.peer_id = peer_id
	record.team_id = team_id
	_records[peer_id] = record


func record_kill(killer_peer_id: int, victim_peer_id: int) -> void:
	if _records.has(killer_peer_id):
		_records[killer_peer_id].kills += 1
	if _records.has(victim_peer_id):
		_records[victim_peer_id].deaths += 1


func record_assist(assister_peer_id: int) -> void:
	if _records.has(assister_peer_id):
		_records[assister_peer_id].assists += 1


## kills 降順、同数なら deaths 昇順でソートしたレコード一覧を返す。
func get_sorted_records() -> Array[PlayerRecord]:
	var records: Array[PlayerRecord] = []
	for record: PlayerRecord in _records.values():
		records.append(record)
	records.sort_custom(_compare_records)
	return records


func _compare_records(a: PlayerRecord, b: PlayerRecord) -> bool:
	if a.kills != b.kills:
		return a.kills > b.kills
	return a.deaths < b.deaths
