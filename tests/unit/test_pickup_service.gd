extends GdUnitTestSuite
## PickupService のサーバー権威な取得判定を検証する（第6.4章）。


func test_second_consume_attempt_before_respawn_fails() -> void:
	var service := PickupService.new()
	service.register_pickup(1, 15.0)

	assert_bool(service.try_consume(1)).is_true()
	assert_bool(service.is_available(1)).is_false()
	assert_bool(service.try_consume(1)).is_false()


func test_pickup_becomes_available_again_after_respawn_duration() -> void:
	var service := PickupService.new()
	service.register_pickup(1, 15.0)
	service.try_consume(1)

	service.advance_time(14.9)
	assert_bool(service.is_available(1)).is_false()

	service.advance_time(0.2)
	assert_bool(service.is_available(1)).is_true()
	assert_bool(service.try_consume(1)).is_true()


func test_unknown_pickup_id_is_rejected() -> void:
	var service := PickupService.new()
	assert_bool(service.try_consume(999)).is_false()
	assert_bool(service.is_available(999)).is_false()
