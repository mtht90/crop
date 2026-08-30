class_name HoldQueue
extends RefCounted

## 保留(最大4)を管理するFIFOキュー。

signal hold_added(count: int)
signal hold_removed(count: int)

const MAX_SIZE: int = 4

var slots: Array[HoldSlot] = []

func is_full() -> bool:
	return slots.size() >= MAX_SIZE

func size() -> int:
	return slots.size()

func try_enqueue(slot: HoldSlot) -> bool:
	if is_full():
		return false
	slots.append(slot)
	hold_added.emit(slots.size())
	return true

func dequeue() -> HoldSlot:
	if slots.is_empty():
		return null
	var slot: HoldSlot = slots.pop_front()
	hold_removed.emit(slots.size())
	return slot
