import { useState } from 'preact/hooks';
import { game } from '../../game/store';
import { ALLIES } from '../../data/monsters';
import { PRESTIGE_MIN_G, fmt, fmtTime, soulMul, stageLabel } from '../../game/core';
import * as L from '../../game/logic';
import { setSound } from '../../game/audio';
import { getField } from '../App';
import { Btn, Modal, Panel, Portrait, SubTabs, Toggle, useGame } from '../common';
import { Soul, TabIcon } from '../icons';

type Sub = 'prestige' | 'codex' | 'settings' | 'credits';

export function MoreTab() {
  const [sub, setSub] = useState<Sub>('prestige');
  return (
    <div class="col">
      <SubTabs
        tabs={[
          ['prestige', '輪廻'],
          ['codex', '図鑑'],
          ['settings', '設定'],
          ['credits', 'クレジット'],
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'prestige' && <Prestige />}
      {sub === 'codex' && <Codex />}
      {sub === 'settings' && <Settings />}
      {sub === 'credits' && <Credits />}
    </div>
  );
}

function Prestige() {
  const s = useGame(3);
  const [confirm, setConfirm] = useState(false);
  const gain = L.prestigeGain(s);
  const can = L.canPrestige(s) && gain > 0;
  const now = soulMul(s.souls);
  const after = soulMul(s.souls + gain);
  return (
    <div class="col">
      <Panel kind="blue">
        <div class="row">
          <TabIcon name="cycle" size={48} />
          <div class="grow">
            <div style={{ fontWeight: 800, fontSize: '17px' }}>輪廻（りんね）</div>
            <div style={{ fontSize: '12px' }}>
              ステージとコイン・修練をリセットして、魂石を得る。魂石1つにつき 全能力+5%・コイン+3%。霊獣・装備・秘術・守護霊・霊晶はそのまま。
            </div>
          </div>
        </div>
      </Panel>
      <Panel kind="wood">
        <div class="report-grid">
          <span>いまの魂石</span>
          <span class="num">
            <Soul size={20} /> {fmt(s.souls)}
          </span>
          <span>最高到達</span>
          <span class="num">{stageLabel(s.maxG)}</span>
          <span>輪廻で得る魂石</span>
          <span class="num up">+{fmt(gain)}</span>
          <span>能力倍率</span>
          <span class="num">
            ×{now.power.toFixed(2)} → <span class="up">×{after.power.toFixed(2)}</span>
          </span>
        </div>
        {!L.canPrestige(s) && <div class="hint" style={{ marginTop: '8px' }}>ステージ {stageLabel(PRESTIGE_MIN_G)} に到達すると輪廻できる。</div>}
        <Btn color="purple" size="lg" disabled={!can} style={{ width: '100%', marginTop: '10px' }} onClick={() => setConfirm(true)}>
          輪廻する
        </Btn>
      </Panel>
      <div class="hint" style={{ margin: '0 6px' }}>
        目安：ボスに勝てなくなって進みが遅くなったら輪廻どき。到達ステージが深いほど魂石が大きく増える。
      </div>
      {confirm && (
        <Modal title="輪廻しますか？" onClose={() => setConfirm(false)}>
          <p class="prose">
            ステージ 1-1 からやり直します。コインと修練レベルは失われますが、魂石 <b>+{gain}</b> を得て、全能力が <b>×{after.power.toFixed(2)}</b> になります。
          </p>
          <div class="row">
            <Btn color="white" class="grow" onClick={() => setConfirm(false)}>
              やめる
            </Btn>
            <Btn
              color="purple"
              class="grow"
              onClick={() => {
                const g = game.act((sv) => L.doPrestige(sv));
                const f = getField();
                if (f) {
                  f.mobs = [];
                  f.boss = null;
                  f.banner = { kind: 'area', title: '輪廻', sub: `魂石 +${g}`, t: 0 };
                  f.bgKey = '';
                  f.setPhase('areaIntro', 2.4);
                  f.preloadArea();
                }
                setConfirm(false);
              }}
            >
              輪廻する
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Codex() {
  const s = useGame(2);
  const have = new Set(s.codex);
  return (
    <div class="col">
      <div class="sec-title">
        <TabIcon name="book" size={24} />
        <span class="grow">
          霊獣図鑑 {have.size}/{ALLIES.length}
        </span>
        <span style={{ fontSize: '13px' }}>全能力 +{have.size * 2}%</span>
      </div>
      <div class="grid small" style={{ gap: '8px' }}>
        {ALLIES.map((a) => (
          <div class="slot" title={have.has(a.id) ? `${a.title} ${a.name}` : '？？？'}>
            <div style={{ filter: have.has(a.id) ? 'none' : 'brightness(0) opacity(0.35)' }}>
              <Portrait ally={a} size={52} />
            </div>
          </div>
        ))}
      </div>
      <div class="hint" style={{ margin: '0 6px' }}>
        霊獣召喚か守護霊で出会うと登録される。
      </div>
    </div>
  );
}

function Settings() {
  const s = useGame(2);
  const [box, setBox] = useState('');
  const [reset, setReset] = useState(false);
  return (
    <div class="col">
      <Panel kind="wood">
        <div class="col">
          <Toggle
            on={s.settings.sound}
            onChange={(v) => {
              game.act((sv) => (sv.settings.sound = v));
              setSound(v);
            }}
            label="効果音"
          />
          <Toggle on={s.settings.autoEquip} onChange={(v) => game.act((sv) => (sv.settings.autoEquip = v))} label="召喚した装備・秘術を自動でつける" />
          <Toggle on={s.settings.autoTrain} onChange={(v) => game.act((sv) => (sv.settings.autoTrain = v))} label="自動修練" />
          <Toggle on={s.settings.autoBoss} onChange={(v) => game.act((sv) => (sv.settings.autoBoss = v))} label="ボスに自動で挑む" />
        </div>
      </Panel>
      <Panel kind="note">
        <div class="col" style={{ gap: '6px' }}>
          <b>記録</b>
          <div class="stat-grid">
            <div>
              <span>討伐数</span>
              <b>{fmt(s.stats.kills)}</b>
            </div>
            <div>
              <span>ボス撃破</span>
              <b>{fmt(s.stats.bossKills)}</b>
            </div>
            <div>
              <span>召喚回数</span>
              <b>{fmt(s.stats.pulls)}</b>
            </div>
            <div>
              <span>輪廻</span>
              <b>{s.stats.prestiges}</b>
            </div>
            <div>
              <span>最高到達</span>
              <b>{stageLabel(s.stats.bestG)}</b>
            </div>
            <div>
              <span>放置時間</span>
              <b>{fmtTime(s.stats.played)}</b>
            </div>
          </div>
        </div>
      </Panel>
      <Panel kind="wood">
        <div class="col" style={{ gap: '6px' }}>
          <b>セーブデータ</b>
          <div class="hint">データはこのブラウザに自動保存される。別の端末へ移すときは書き出した文字列を読み込む。</div>
          <textarea class="save-box" value={box} onInput={(e) => setBox((e.target as HTMLTextAreaElement).value)} placeholder="ここに書き出し／貼り付け" />
          <div class="row">
            <Btn size="sm" color="blue" class="grow" onClick={() => setBox(game.exportSave())}>
              書き出す
            </Btn>
            <Btn
              size="sm"
              color="green"
              class="grow"
              disabled={!box.trim()}
              onClick={() => {
                try {
                  game.importSave(box);
                  game.toast('読み込みました', 'good');
                  getField()?.resetHero(true);
                } catch {
                  game.toast('読み込めませんでした', 'warn');
                }
              }}
            >
              読み込む
            </Btn>
            <Btn size="sm" color="red" class="grow" onClick={() => setReset(true)}>
              最初から
            </Btn>
          </div>
        </div>
      </Panel>
      {reset && (
        <Modal title="最初からやり直す？" onClose={() => setReset(false)}>
          <p class="prose">すべてのデータが消えます。元に戻せません。</p>
          <div class="row">
            <Btn color="white" class="grow" onClick={() => setReset(false)}>
              やめる
            </Btn>
            <Btn
              color="red"
              class="grow"
              onClick={() => {
                game.reset();
                location.reload();
              }}
            >
              消して最初から
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Credits() {
  return (
    <Panel kind="wood">
      <div class="prose credits">
        <p>
          <b style={{ fontSize: '18px' }}>Spirit Master</b>
        </p>
        <h4>キャラクター・モンスター</h4>
        <p>
          Ækashics — Librarium
          <br />
          <a href="https://www.akashics.moe/" target="_blank" rel="noopener">
            https://www.akashics.moe/
          </a>
        </p>
        <h4>UI</h4>
        <p>
          Cozy UI Pack by dobo_ui
          <br />
          <a href="https://dobo-ui.itch.io/cozy-ui" target="_blank" rel="noopener">
            https://dobo-ui.itch.io/cozy-ui
          </a>
        </p>
        <h4>フォント</h4>
        <p>M PLUS Rounded 1c（SIL Open Font License）</p>
        <p class="hint">素材の再配布・転用はできません。ゲーム内の名前は素材の名前から変更しています。</p>
      </div>
    </Panel>
  );
}
