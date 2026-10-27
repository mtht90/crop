import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { artUrl } from '../lib/assets';
import { foley, playMusic, sfx } from '../audio/audio';
import { ACHIEVEMENTS, dailyMissions, extCtx, NORMAL_MISSIONS, useStore, weeklyMissions, type Save } from '../state/store';
import {
  canClaimLogin,
  ensurePeriods,
  fmtRemain,
  LOGIN_REWARDS,
  loginSlot,
  missionValue,
  msUntilNextWeek,
  msUntilTomorrow,
  type Mission,
} from '../state/progress';

type Tab = 'login' | 'normal' | 'daily' | 'weekly' | 'achv';
type Period = 'normal' | 'daily' | 'weekly' | 'achv';

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
  const list = period === 'daily' ? dailyMissions(p) : period === 'weekly' ? weeklyMissions(p) : period === 'normal' ? NORMAL_MISSIONS : ACHIEVEMENTS;
  const claimedIds = period === 'daily' ? p.daily.claimed : period === 'weekly' ? p.weekly.claimed : period === 'normal' ? (p.normalClaimed ?? []) : p.achvClaimed;
  let out = list.map((m) => {
    const value = missionValue(p, m, period, ext);
    return { m, period, value, done: value >= m.target, claimed: claimedIds.includes(m.id) };
  });
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
  const [flash, setFlash] = useState<{ id: number; coins: number } | null>(null);

  const data = useMemo(() => ({ normal: rows(save, 'normal'), daily: rows(save, 'daily'), weekly: rows(save, 'weekly'), achv: rows(save, 'achv') }), [save]);
  const count = (list: Row[]) => list.filter((r) => r.done && !r.claimed).length;
  const tabs: { id: Tab; label: string; icon: string; n: number }[] = [
    { id: 'login', label: 'ログインボーナス', icon: 'crown', n: canClaimLogin(save.progress) ? 1 : 0 },
    { id: 'normal', label: '通常', icon: 'scroll-quill', n: count(data.normal) },
    { id: 'daily', label: 'デイリー', icon: 'hourglass', n: count(data.daily) },
    { id: 'weekly', label: 'ウィークリー', icon: 'scroll-unfurled', n: count(data.weekly) },
    { id: 'achv', label: '実績', icon: 'trophy', n: count(data.achv) },
  ];

  const give = (coins: number) => {
    if (!coins) return;
    foley.chime(6);
    sfx('gold', 0.6);
    setFlash({ id: Date.now(), coins });
  };
  const claim = (r: Row) => give(claimMission(r.m, r.period));
  const claimAll = (list: Row[]) => {
    let sum = 0;
    for (const r of list) if (r.done && !r.claimed) sum += useStore.getState().claimMission(r.m, r.period);
    give(sum);
  };

  const list = tab === 'login' ? [] : data[tab];
  const remain = tab === 'daily' ? `リセットまで ${fmtRemain(msUntilTomorrow(new Date(now)))}` : tab === 'weekly' ? `リセットまで ${fmtRemain(msUntilNextWeek(new Date(now)))}` : '';

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
                            <Icon name="coin" /> {r.m.reward.toLocaleString()}
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
            <Icon name="coin" /> +{flash.coins.toLocaleString()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 7-day login bonus track. Used on the missions screen and in the home popup. */
export function LoginTrack({ onClaim, compact }: { onClaim?: (coins: number) => void; compact?: boolean }) {
  const progress = useStore((s) => s.save.progress);
  const claimLogin = useStore((s) => s.claimLogin);
  const now = useNow(30000);
  const can = canClaimLogin(progress);
  // the slot shown as "today": if already claimed today it is the previous slot
  const today = can ? loginSlot(progress) : (progress.loginCount + 6) % 7;
  return (
    <div className={`login ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="ms3-head">
          <span className="ms-remain">
            <Icon name="hourglass" /> 次の受け取りまで {can ? '―' : fmtRemain(msUntilTomorrow(new Date(now)))}
          </span>
        </div>
      )}
      <div className="login-track">
        {LOGIN_REWARDS.map((c, i) => {
          const got = i < today || (i === today && !can);
          const cur = i === today;
          return (
            <div key={i} className={`login-day ${got ? 'got' : ''} ${cur ? 'cur' : ''} ${i === 6 ? 'last' : ''}`}>
              <div className="d">DAY {i + 1}</div>
              <div className="ico">
                <Icon name={i === 6 ? 'chest' : 'coin'} />
              </div>
              <div className="c">{c}</div>
              {got && (
                <div className="stamp">
                  <Icon name="check" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="login-foot">
        <span>通算ログイン {progress.loginCount} 日</span>
        <button
          className="btn"
          disabled={!can}
          onClick={() => {
            const got = claimLogin();
            onClaim?.(got);
          }}
        >
          {can ? `${LOGIN_REWARDS[today]} コインを受け取る` : '本日は受け取り済み'}
        </button>
      </div>
    </div>
  );
}
