extends GdUnitTestSuite
## Scoreboard の集計・ソート順を検証する。


func test_sorted_records_rank_by_kills_descending() -> void:
	var scoreboard := Scoreboard.new()
	scoreboard.register_player(1, 0)
	scoreboard.register_player(2, 0)
	scoreboard.register_player(3, 1)

	# peer1: 2 kills. peer2: 1 kill. peer3: 0 kills.
	scoreboard.record_kill(1, 3)
	scoreboard.record_kill(1, 3)
	scoreboard.record_kill(2, 3)

	var sorted_records: Array[Scoreboard.PlayerRecord] = scoreboard.get_sorted_records()

	assert_int(sorted_records.size()).is_equal(3)
	assert_int(sorted_records[0].peer_id).is_equal(1)
	assert_int(sorted_records[0].kills).is_equal(2)
	assert_int(sorted_records[1].peer_id).is_equal(2)
	assert_int(sorted_records[1].kills).is_equal(1)
	assert_int(sorted_records[2].peer_id).is_equal(3)
	assert_int(sorted_records[2].kills).is_equal(0)
	assert_int(sorted_records[2].deaths).is_equal(3)


func test_tie_in_kills_is_broken_by_fewer_deaths() -> void:
	var scoreboard := Scoreboard.new()
	scoreboard.register_player(1, 0) # ends with 1 kill, 1 death
	scoreboard.register_player(2, 0) # ends with 1 kill, 0 deaths
	scoreboard.register_player(3, 1) # ends with 1 kill, 2 deaths

	scoreboard.record_kill(1, 3) # peer1.kills=1, peer3.deaths=1
	scoreboard.record_kill(2, 3) # peer2.kills=1, peer3.deaths=2
	scoreboard.record_kill(3, 1) # peer3.kills=1, peer1.deaths=1

	var sorted_records: Array[Scoreboard.PlayerRecord] = scoreboard.get_sorted_records()

	# 全員 1 kill のため deaths 昇順: peer2(0) -> peer1(1) -> peer3(2)
	assert_int(sorted_records[0].peer_id).is_equal(2)
	assert_int(sorted_records[1].peer_id).is_equal(1)
	assert_int(sorted_records[2].peer_id).is_equal(3)


func test_assists_are_tracked_independently_of_kills() -> void:
	var scoreboard := Scoreboard.new()
	scoreboard.register_player(1, 0)
	scoreboard.record_assist(1)
	scoreboard.record_assist(1)

	var records: Array[Scoreboard.PlayerRecord] = scoreboard.get_sorted_records()
	assert_int(records[0].assists).is_equal(2)
	assert_int(records[0].kills).is_equal(0)
