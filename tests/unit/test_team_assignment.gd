extends GdUnitTestSuite
## TeamAssignment の3v3割り当て・バランス調整を検証する。


func test_players_are_balanced_across_both_teams() -> void:
	var assignment := TeamAssignment.new()
	var assigned_team_ids: Array[int] = []
	for peer_id: int in range(6):
		assigned_team_ids.append(assignment.assign_player(peer_id))

	assert_int(assignment.get_team_members(0).size()).is_equal(3)
	assert_int(assignment.get_team_members(1).size()).is_equal(3)
	assert_bool(assignment.is_match_full()).is_true()


func test_match_rejects_a_seventh_player() -> void:
	var assignment := TeamAssignment.new()
	for peer_id: int in range(6):
		assignment.assign_player(peer_id)

	var result: int = assignment.assign_player(999)
	assert_int(result).is_equal(-1)


func test_removing_a_player_frees_a_slot_for_reassignment() -> void:
	var assignment := TeamAssignment.new()
	for peer_id: int in range(6):
		assignment.assign_player(peer_id)

	assignment.remove_player(0)
	assert_bool(assignment.is_match_full()).is_false()

	var reassigned_team_id: int = assignment.assign_player(42)
	assert_int(reassigned_team_id).is_not_equal(-1)
	assert_bool(assignment.is_match_full()).is_true()
