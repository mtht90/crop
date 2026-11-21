import { spriteUrl } from '../../render/sprites';
import { Btn, Modal } from '../common';

export function IntroModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="ようこそ、霊使い" onClose={onClose}>
      <div class="col">
        <div class="intro-art">
          <img src={spriteUrl('Slime RPG Attacker')} style={{ height: '70%' }} />
          <img src={spriteUrl('Boss Goddess Innova')} />
          <img src={spriteUrl('Forest Mobun')} style={{ height: '50%' }} />
        </div>
        <div class="prose">
          <p>魔物があふれた世界で、あなたは霊獣を呼び出して戦わせる<b>霊使い（Spirit Master）</b>。</p>
          <p>出撃した霊獣は<b>放っておいても</b>魔物を狩り、討伐ゲージが溜まるとボスに挑む。勝てば次のステージへ、負けたら強くなるまで周回する。</p>
          <p>コインで<b>修練</b>、霊晶で<b>召喚</b>。魔物が落とす霊珠からは<b>守護霊</b>が宿る。ブラウザを閉じている間も冒険は進む。</p>
        </div>
        <Btn color="green" size="lg" onClick={onClose}>冒険をはじめる</Btn>
      </div>
    </Modal>
  );
}
