import { fmt } from '../core/format';
import type { Game } from '../core/game';
import type { LayerId } from '../core/state';
import { LAYER_INFO, doPrestige, layerGain } from '../logic/prestige';
import { modal, toast } from './fx';

const RESET_TEXT: Record<LayerId, string> = {
  sn: '星屑・施設・アップグレードがリセットされます。',
  galaxy: '超新星までの進行に加えて、星核と超新星ショップ (保持の効果がない限り) がリセットされます。挑戦中のチャレンジも終了します。',
  crunch: '銀河崩壊までの進行に加えて、ダークマターと銀河ショップ (保持の効果がない限り) がリセットされます。',
  mv: 'ビッグクランチまでの進行に加えて、エントロピーとクランチショップ (保持の効果がない限り) がリセットされます。',
};

export async function prestigeWithConfirm(g: Game, layer: LayerId): Promise<void> {
  const gainAmt = layerGain(g, layer);
  if (gainAmt.lt(1)) return;
  const info = LAYER_INFO[layer];
  if (g.s.settings.confirmPrestige) {
    const ok = await modal({
      title: `${info.icon} ${info.name}`,
      body: `${info.currency}を ${fmt(gainAmt)} 獲得します。\n${RESET_TEXT[layer]}\n研究・遺物・実績・チャレンジの記録は失われません。`,
      ok: info.verb,
    });
    if (!ok) return;
  }
  if (doPrestige(g, layer)) toast(`${info.icon} ${info.name}! ${info.currency} +${fmt(gainAmt)}`, 'good');
}

export { RESET_TEXT };
