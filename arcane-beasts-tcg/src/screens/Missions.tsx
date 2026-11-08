import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { artUrl, asset } from '../lib/assets';
import { vibrate } from '../lib/fx';
import { foley, playMusic, sfx } from '../audio/audio';
import { currentStageEvent, STAGE_COUNT, stageNow } from '../state/stages';
import { ACHIEVEMENTS, dailyMissions, extCtx, NORMAL_MISSIONS, useStore, weeklyMissions, type Save, type Wallet } from '../state/store';
import {
  canClaimLogin,
  currentEvent,
  ensurePeriods,
  fmtRemain,
  LOGIN_GEMS,
  LOGIN_REWARDS,
  loginSlot,
  missionGems,
  missionValue,
  msUntilNextWeek,
  msUntilTomorrow,
  type Mission,
} from '../state/progress';

type Tab = 'login' | 'event' | 'normal' | 'daily' | 'weekly' | 'achv';
type Period = 'normal' | 'daily' | 'weekly' | 'achv' | 'event';

interface Row {
  m: Mission;
  period: Period;
  value: number;
  done: boolean;
  claimed: boolean;
}

function rows(save: Save, period: Period): Row[] {
  const p = structuredClone(save.progress);
  ensurePeriods(p);
  const ext = extCtx(save);
  const list =
    period === 'daily' ? dailyMissions(p) : period === 'weekly' ? weeklyMissions(p) : period === 'normal' ? NORMAL_MISSIONS : period === 'event' ? currentEvent(p).tasks : ACHIEVEMENTS;
  const claimedIds =
    period === 'daily' ? p.daily.claimed : period === 'weekly' ? p.weekly.claimed : period === 'normal' ? (p.normalClaimed ?? []) : period === 'event' ? (p.event?.claimed ?? []) : p.achvClaimed;
  let out = list.map((m) => {
    const value = missionValue(p, m, period, ext);
    return { m, period, value, done: value >= m.target, claimed: claimedIds.includes(m.id) };
  });
  if (period === 'event') return out; // in the event's own order: the all-clear bonus last
  if (period === 'achv') {
    // Only show the lowest unclaimed tier of each achievement line (plus claimed history hidden)
    const seen = new Set<string>();
    out = out.filter((r) => {
      const line = r.m.id.replace(/-\d+$/, '');
      if (r.claimed) return false;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
  }
  if (period === 'normal') {
    // hide what has been claimed; the closest goals come first
    out = out.filter((r) => !r.claimed);
    const near = (r: Row) => (r.done ? 2 : r.value / r.m.target);
    return out.sort((a, b) => near(b) - near(a));
  }
  // claimable first, then in progress, then claimed
  const rank = (r: Row) => (r.claimed ? 2 : r.done ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Missions() {
  const save = useStore((s) => s.save);
  const claimMission = useStore((s) => s.claimMission);
  useEffect(() => playMusic('menu'), []);
  const now = useNow();
  const [tab, setTab] = useState<Tab>(() => (canClaimLogin(save.progress) ? 'login' : 'normal'));
  const [flash, setFlash] = useState<({ id: number } & Wallet) | null>(null);

  const data = useMemo(() => ({ event: rows(save, 'event'), normal: rows(save, 'normal'), daily: rows(save, 'daily'), weekly: rows(save, 'weekly'), achv: rows(save, 'achv') }), [save]);
  const count = (list: Row[]) => list.filter((r) => r.done && !r.claimed).length;
  const tabs: { id: Tab; label: string; icon: string; n: number }[] = [
    { id: 'login', label: 'ログインボーナス', icon: 'crown', n: canClaimLogin(save.progress) ? 1 : 0 },
    { id: 'event', label: 'イベント', icon: 'sparkles', n: 0 },
    { id: 'normal', label: '通常', icon: 'scroll-quill', n: count(data.normal) },
    { id: 'daily', label: 'デイリー', icon: 'hourglass', n: count(data.daily) },
    { id: 'weekly', label: 'ウィークリー', icon: 'scroll-unfurled', n: count(data.weekly) },
    { id: 'achv', label: '実績', icon: 'trophy', n: count(data.achv) },
  ];

  const give = (w: Wallet) => {
    if (!w.coins && !w.gems) return;
    foley.chime(6);
    sfx('gold', 0.6);
    setFlash({ id: Date.now(), ...w });
  };
  const claim = (r: Row) => give(claimMission(r.m, r.period));
  const claimAll = (list: Row[]) => {
    const sum: Wallet = { coins: 0, gems: 0 };
    for (const r of list)
      if (r.done && !r.claimed) {
        const w = useStore.getState().claimMission(r.m, r.period);
        sum.coins += w.coins;
        sum.gems += w.gems;
      }
    give(sum);
  };

  const list = tab === 'login' ? [] : data[tab];
  const event = currentEvent(save.progress);
  const remain =
    tab === 'daily'
      ? `リセットまで ${fmtRemain(msUntilTomorrow(new Date(now)))}`
      : tab === 'event'
        ? `終了まで ${fmtRemain(msUntilNextWeek(new Date(now)))}`
        : tab === 'weekly'
          ? `リセットまで ${fmtRemain(msUntilNextWeek(new Date(now)))}` : '';

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-castle')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="ミッション" back="more" />
        <div className="page-inner ms3">
          <div className="ms3-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`chip-btn ${tab === t.id ? 'on' : ''}`}
                onClick={() => {
                  foley.tick();
                  setTab(t.id);
                }}
              >
                <Icon name={t.icon} />
                {t.label}
                {t.n > 0 && <i className="ms3-dot">{t.n}</i>}
              </button>
            ))}
          </div>

          <div className="box ms3-body">
            {tab === 'login' ? (
              <LoginTrack onClaim={give} />
            ) : tab === 'event' ? (
              <StageBanner />
            ) : (
              <>
                <div className="ms3-head">
                  {remain && (
                    <span className="ms-remain">
                      <Icon name="hourglass" /> {remain}
                    </span>
                  )}
                  <button className="btn small" disabled={!count(list)} onClick={() => claimAll(list)}>
                    まとめて受け取る
                  </button>
                </div>
                <div className="ms3-list">
                  <AnimatePresence initial={false}>
                    {list.map((r, i) => (
                      <motion.div
                        layout
                        key={r.m.id}
                        className={`ms3-row ${r.done ? 'done' : ''} ${r.claimed ? 'claimed' : ''}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 30 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 12) * 0.03 }}
                      >
                        <div className="ms3-main">
                          <div className="ms3-label">{r.m.label}</div>
                          <div className="ms3-prog">
                            <div className="ms3-bar">
                              <div style={{ transform: `scaleX(${Math.min(1, r.value / r.m.target)})` }} />
                            </div>
                            <span>
                              {Math.min(r.value, r.m.target).toLocaleString()} / {r.m.target.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button className={`ms3-claim ${r.done && !r.claimed ? 'ready' : ''}`} disabled={!r.done || r.claimed} onClick={() => claim(r)}>
                          <span>
                            {missionGems(r.m) > 0 && (
                              <i className="ms3-gem">
                                <Icon name="gem" /> {missionGems(r.m)}
                              </i>
                            )}
                          </span>
                          <small>{r.claimed ? '受取済み' : r.done ? '受け取る' : '未達成'}</small>
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {tab === 'achv' && !list.length && <div className="empty-note">すべての実績を達成しました</div>}
                  {tab === 'normal' && !list.length && <div className="empty-note">すべての通常ミッションを達成しました</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.id}
            className="coin-flash"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => setTimeout(() => setFlash((f) => (f?.id === flash.id ? null : f)), 900)}
          >
            
            {flash.gems > 0 && <span className="flash-gem"><Icon name="gem" /> +{flash.gems.toLocaleString()}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** the stage event's way in (the event tab used to hold the weekly tasks) */
function StageBanner() {
  const go = useStore((s) => s.go);
  const sv = stageNow(useStore((s) => s.save.stages));
  const { ev, ends } = currentStageEvent();
  return (
    <button className="ms3-event stg-banner" style={{ backgroundImage: `url(${artUrl(ev.bg)})` }} onClick={() => (sfx('expand', 0.5), go('stage'))}>
      <small>期間限定イベント ・ あと {fmtRemain(ends.getTime() - Date.now())}</small>
      <b>{ev.title.join('')}</b>
      <p>{ev.blurb}</p>
      <span className="stg-banner-go">
        {Math.min(sv.cleared, STAGE_COUNT)}/{STAGE_COUNT} ステージ ・ マップへ ›
      </span>
    </button>
  );
}

/** each day's stamp lands at its own slight angle, like it was pressed by hand */
const STAMP_TILT = [-12, 9, -7, 13, -10, 6, -15];
const STAMP = asset('ui/stamp.webp');

/** 7-day login bonus track. Used on the missions screen and in the home popup.
 *  Claiming slams the emblem stamp onto today's square. */
export function LoginTrack({ onClaim, compact }: { onClaim?: (w: Wallet) => void; compact?: boolean }) {
  const progress = useStore((s) => s.save.progress);
  const claimLogin = useStore((s) => s.claimLogin);
  const now = useNow(30000);
  const can = canClaimLogin(progress);
  // the slot shown as "today": if already claimed today it is the previous slot
  const today = can ? loginSlot(progress) : (progress.loginCount + 6) % 7;
  // the square being stamped right now (the press plays once, then it stays like the others)
  const [fresh, setFresh] = useState<number | null>(null);
  const [shake, setShake] = useState(0);
  const [plus, setPlus] = useState<number | null>(null);
  const pressed = useRef(false);
  const press = () => {
    if (!can || fresh !== null || pressed.current) return;
    pressed.current = true;
    const slot = today;
    const amount = LOGIN_REWARDS[slot] + LOGIN_GEMS[slot];
    setFresh(slot);
    foley.whoosh();
    // the moment the stamp hits the paper
    setTimeout(() => {
      foley.impact();
      foley.boom(slot === 6 ? 1.4 : 0.8);
      sfx('ink', 0.55);
      vibrate(slot === 6 ? [30, 40, 60] : 35);
      setShake((n) => n + 1);
      const got = claimLogin();
      setTimeout(() => {
        setPlus(amount);
        onClaim?.(got);
      }, 260);
    }, 470);
  };
  // the screen opens, a beat, and today's stamp comes down by itself
  useEffect(() => {
    if (!can) return;
    const t = setTimeout(press, 750);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can]);
  return (
    <div className={`login ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="ms3-head">
          <span className="ms-remain">
            <Icon name="hourglass" /> 次の受け取りまで {can ? '―' : fmtRemain(msUntilTomorrow(new Date(now)))}
          </span>
        </div>
      )}
      <motion.div
        key={shake}
        className="login-track"
        animate={shake ? { x: [0, -7, 6, -4, 3, -1, 0], y: [0, 5, -3, 2, -1, 0, 0] } : undefined}
        transition={{ duration: 0.42, ease: 'easeOut' }}
      >
        {LOGIN_REWARDS.map((c, i) => {
          const isFresh = fresh === i;
          const got = !isFresh && (i < today || (i === today && !can));
          const cur = i === today;
          return (
            <div
              key={i}
              className={`login-day ${got ? 'got' : ''} ${cur ? 'cur' : ''} ${isFresh ? 'fresh' : ''} ${i === 6 ? 'last' : ''}`}
            >
              <div className="d">DAY {i + 1}</div>
              <div className="ico">
                <Icon name={i === 6 ? 'chest' : 'gem'} />
              </div>
              <div className="c">{c + LOGIN_GEMS[i]}</div>
              {got && <img className="hanko" src={STAMP} alt="" style={{ transform: `rotate(${STAMP_TILT[i]}deg)` }} />}
              {cur && can && fresh === null && <img className="hanko ghost" src={STAMP} alt="" style={{ ['--r' as string]: `${STAMP_TILT[i]}deg` }} />}
              {isFresh && <Slam tilt={STAMP_TILT[i]} big={i === 6} />}
              <AnimatePresence>
                {isFresh && compact && plus !== null && (
                  <motion.div
                    className="login-plus"
                    initial={{ opacity: 0, y: 6, scale: 0.6 }}
                    animate={{ opacity: [0, 1, 1, 0], y: -46, scale: 1 }}
                    transition={{ duration: 1.5, times: [0, 0.15, 0.7, 1], ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    +{plus} <Icon name="gem" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </motion.div>
      <div className="login-foot">
        <span>通算ログイン {progress.loginCount} 日</span>
      </div>
    </div>
  );
}

/** the press: the stamp lifts, hangs a beat, slams down with a squash, and the ink bursts out */
function Slam({ tilt, big }: { tilt: number; big: boolean }) {
  const drops = useMemo(
    () =>
      Array.from({ length: big ? 16 : 11 }, (_, k) => {
        const a = (k / (big ? 16 : 11)) * Math.PI * 2 + Math.random() * 0.5;
        const d = 30 + Math.random() * (big ? 46 : 30);
        return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 3 + Math.random() * 5, t: Math.random() * 0.06 };
      }),
    [big],
  );
  const HIT = 0.47;
  return (
    <div className="slam">
      {/* the shadow grows and sharpens as the stamp comes down */}
      <motion.div
        className="slam-shadow"
        initial={{ opacity: 0, scale: 1.6 }}
        animate={{ opacity: [0, 0.5, 0.75, 0], scale: [1.6, 1.25, 0.9, 0.9] }}
        transition={{ duration: HIT + 0.1, times: [0, 0.6, 0.97, 1] }}
      />
      <motion.img
        className="hanko slam-img"
        src={STAMP}
        alt=""
        initial={{ opacity: 0, scale: 2.8, rotate: tilt - 22, y: -40 }}
        animate={{
          opacity: [0, 1, 1, 1, 1],
          scale: [2.8, 2.35, 0.86, 1.06, 1],
          rotate: [tilt - 22, tilt - 26, tilt + 1, tilt, tilt],
          y: [-40, -52, 0, 0, 0],
        }}
        transition={{ duration: HIT + 0.3, times: [0, 0.48, HIT / (HIT + 0.3), 0.8, 1], ease: ['easeOut', [0.7, 0, 0.9, 0.4], 'easeOut', 'easeInOut'] }}
      />
      {/* the flash and the ring of the impact */}
      <motion.div
        className="slam-flash"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0, 0.95, 0], scale: [0.4, 0.4, 1.2, 1.6] }}
        transition={{ duration: HIT + 0.35, times: [0, 0.57, 0.62, 1] }}
      />
      <motion.div
        className="slam-ring"
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0, 0.9, 0], scale: [0.3, 0.3, 0.9, big ? 3.2 : 2.4] }}
        transition={{ duration: HIT + 0.45, times: [0, 0.5, 0.55, 1], ease: 'easeOut' }}
      />
      {drops.map((p, k) => (
        <motion.i
          key={k}
          className="slam-drop"
          style={{ width: p.s, height: p.s }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0, 1, 0], x: [0, 0, p.x * 0.7, p.x], y: [0, 0, p.y * 0.7, p.y + 10], scale: [0.4, 0.4, 1, 0.6] }}
          transition={{ duration: HIT + 0.55, times: [0, (HIT + p.t) / (HIT + 0.55), (HIT + p.t + 0.12) / (HIT + 0.55), 1], ease: 'easeOut' }}
        />
      ))}
      {/* the ink soaks in: a red glow that settles */}
      <motion.div
        className="slam-glow"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 0.35] }}
        transition={{ duration: HIT + 1.1, times: [0, 0.3, 0.38, 1] }}
      />
    </div>
  );
}
