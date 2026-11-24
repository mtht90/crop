import type { Player, Team } from './data';

export interface Side {
  team: Team;
  battingIndex: number;
  runs: number[]; // 回ごとの得点
  hits: number;
  errors: number;
  pitcher: Player;
  pitchCount: number;
  stamina: number; // 0..1
}

export interface InningResult { half: 'top' | 'bottom'; inning: number }

export interface BatterLine { ab: number; h: number; hr: number; rbi: number; bb: number; so: number }

/** 試合の状態（カウント・アウト・塁・得点） */
export class GameState {
  inning = 1;
  half: 'top' | 'bottom' = 'top';
  balls = 0;
  strikes = 0;
  outs = 0;
  bases: (Player | null)[] = [null, null, null]; // 一・二・三塁
  away: Side;
  home: Side;
  innings: number;
  over = false;
  lines = new Map<Player, BatterLine>();

  constructor(away: Team, home: Team, innings: number) {
    this.innings = innings;
    const side = (team: Team): Side => ({ team, battingIndex: 0, runs: [], hits: 0, errors: 0, pitcher: team.players.find((p) => p.pos === 'P')!, pitchCount: 0, stamina: 1 });
    this.away = side(away);
    this.home = side(home);
  }

  get batting() {
    return this.half === 'top' ? this.away : this.home;
  }
  get fielding() {
    return this.half === 'top' ? this.home : this.away;
  }
  get batter() {
    const b = this.batting;
    return b.team.players[b.battingIndex % 9];
  }
  score(side: Side) {
    return side.runs.reduce((a, b) => a + b, 0);
  }
  line(p: Player) {
    let l = this.lines.get(p);
    if (!l) this.lines.set(p, (l = { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, so: 0 }));
    return l;
  }

  addRuns(n: number) {
    const s = this.batting;
    while (s.runs.length < this.inning) s.runs.push(0);
    s.runs[this.inning - 1] += n;
  }

  nextBatter() {
    this.batting.battingIndex++;
    this.balls = 0;
    this.strikes = 0;
  }

  /** 押し出しなどの強制進塁（四球） */
  walk(): number {
    const b = this.batter;
    let runs = 0;
    if (this.bases[0]) {
      if (this.bases[1]) {
        if (this.bases[2]) runs++;
        this.bases[2] = this.bases[1];
      }
      this.bases[1] = this.bases[0];
    }
    this.bases[0] = b;
    if (runs) this.addRuns(runs);
    this.line(b).bb++;
    this.line(b).rbi += runs;
    return runs;
  }

  /** 3アウトで攻守交代。試合終了なら true */
  endHalf(): boolean {
    const s = this.batting;
    while (s.runs.length < this.inning) s.runs.push(0);
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    this.bases = [null, null, null];
    if (this.half === 'top') {
      // 最終回の表が終わって後攻がリード → 試合終了
      if (this.inning >= this.innings && this.score(this.home) > this.score(this.away)) return (this.over = true);
      this.half = 'bottom';
    } else {
      if (this.inning >= this.innings && this.score(this.home) !== this.score(this.away)) return (this.over = true);
      if (this.inning >= this.innings + 3) return (this.over = true); // 延長は3回まで
      this.inning++;
      this.half = 'top';
    }
    return false;
  }

  /** サヨナラ判定 */
  walkOff() {
    return this.half === 'bottom' && this.inning >= this.innings && this.score(this.home) > this.score(this.away);
  }
}
