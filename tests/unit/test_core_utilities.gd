extends GdUnitTestSuite
## Phase 1 の汎用基盤（Result / StateMachine / ObjectPool）の疎通テスト。


func test_result_ok_and_err() -> void:
	var ok_result: Result = Result.ok(42)
	assert_bool(ok_result.is_ok()).is_true()
	assert_int(ok_result.unwrap()).is_equal(42)

	var err_result: Result = Result.err("failure")
	assert_bool(err_result.is_err()).is_true()
	assert_str(err_result.error_message()).is_equal("failure")


func test_state_machine_rejects_undefined_transitions() -> void:
	var state_machine: StateMachine = StateMachine.new(&"warmup")
	state_machine.define_transition(&"warmup", &"live")

	assert_bool(state_machine.can_transition_to(&"post_match")).is_false()
	assert_bool(state_machine.transition_to(&"post_match")).is_false()
	assert_that(state_machine.get_current_state()).is_equal(&"warmup")

	assert_bool(state_machine.transition_to(&"live")).is_true()
	assert_that(state_machine.get_current_state()).is_equal(&"live")


func test_object_pool_reuses_released_instances() -> void:
	var pool: ObjectPool = ObjectPool.new(func() -> Node: return Node.new())
	var first_instance: Node = pool.acquire()
	pool.release(first_instance)
	var second_instance: Node = pool.acquire()

	assert_object(second_instance).is_same(first_instance)
	assert_int(pool.get_available_count()).is_equal(0)
	assert_int(pool.get_in_use_count()).is_equal(1)

	first_instance.free()
