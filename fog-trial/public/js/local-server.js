// オフライン版: サーバーを用意できない環境 (静的ホスティングなど) で、
// サーバーのロビー・ゲームロジック・ボットをブラウザ内でそのまま動かす。
// WebSocket と同じ send() / メッセージ形式なので、main.js 側は通信先を差し替えるだけで済む。
import { Room } from '../server/room.js';

export function createLocalSocket(deliver) {
  let room = null;
  let member = null;
  // Room から見た「クライアントの WebSocket」。非同期で main.js に届ける
  const clientWs = {
    readyState: 1,
    send: (data) => setTimeout(() => deliver(JSON.parse(data)), 0),
  };
  const reply = (msg) => clientWs.send(JSON.stringify(msg));

  const join = (name) => {
    const r = new Room('SOLO', () => {
      if (room === r) room = null;
    });
    const res = r.addHuman(clientWs, name);
    if (res.error) {
      reply({ type: 'error', text: res.error });
      return false;
    }
    room = r;
    member = res.member;
    reply({ type: 'joined', room: r.code, you: member.id });
    r.broadcastLobby();
    return true;
  };

  return {
    readyState: 1,
    send(data) {
      const msg = JSON.parse(data);
      if (!room) {
        if (msg.type === 'create' || msg.type === 'quick') {
          if (!join(msg.name)) return;
          if (msg.type === 'quick') {
            room.handle(member, { type: 'setRole', role: msg.role });
            if (msg.character) room.handle(member, { type: 'setCharacter', character: msg.character });
            if (msg.level !== undefined) room.handle(member, { type: 'setBotLevel', level: msg.level });
            room.fillBots();
            room.start();
          }
        } else if (msg.type === 'join') {
          reply({ type: 'error', text: 'オフライン版ではほかの部屋に参加できません' });
        }
        return;
      }
      if (msg.type === 'leave') {
        room.removeMember(member.id);
        room = null;
        member = null;
        reply({ type: 'left' });
        return;
      }
      room.handle(member, msg);
    },
  };
}
