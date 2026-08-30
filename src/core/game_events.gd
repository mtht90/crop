extends Node
## GameEvents: 型付きシグナルのみを持つグローバルイベントバス（Autoload）。
## 状態を一切保持しない。Presentation 層はここへの購読のみで Simulation 層の変化を知る。

signal hero_died(hero_instance_id: int, killer_hero_id: int)
signal health_changed(hero_instance_id: int, current_health: float, max_health: float)
signal match_state_changed(previous_state: StringName, new_state: StringName)
signal round_started(round_number: int)
signal round_ended(winning_team_id: int)
