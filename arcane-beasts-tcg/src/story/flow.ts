// Story progress and how a chapter runs: scene → duel → scene.
import { deckById, expand, RIVALS } from '../engine/decks';
import { activeDeck, useStore, type Save } from '../state/store';
import { CHAPTERS, PROLOGUE, type Chapter } from './index';

export type ChapterState = 'cleared' | 'open' | 'locked';

/** a chapter counts as cleared once it has been won through the story (free battles do not count) */
export function isCleared(save: Save, ch: Chapter): boolean {
  return save.story.cleared.includes(ch.id);
}

export function chapterState(save: Save, i: number): ChapterState {
  const ch = CHAPTERS[i];
  if (isCleared(save, ch)) return 'cleared';
  if (i === 0 || isCleared(save, CHAPTERS[i - 1])) return 'open';
  return 'locked';
}

/** the chapter to continue with (first one not cleared) */
export function nextChapterIndex(save: Save): number {
  const i = CHAPTERS.findIndex((c) => !isCleared(save, c));
  return i === -1 ? CHAPTERS.length - 1 : i;
}

function beginDuel(ch: Chapter) {
  const st = useStore.getState();
  const deck = activeDeck(st.save);
  const r = RIVALS.find((x) => x.id === ch.rival)!;
  if (!deck) return st.go('story');
  st.startBattle({
    rival: r,
    playerDeck: deck.cards,
    oppDeck: expand(deckById(r.deck).cards),
    oppName: r.name,
    oppPortrait: r.portrait,
    level: r.level,
    scene: r.scene,
    reward: r.reward,
    story: { chapterId: ch.id },
  });
}

/** play the opening conversation (if enabled), then the duel */
export function startChapter(ch: Chapter) {
  const st = useStore.getState();
  const go = () => {
    if (st.save.story.scenes) st.playScene(`${ch.id}:before`, ch.before, () => beginDuel(ch));
    else beginDuel(ch);
  };
  // the very first chapter is preceded by the prologue
  if (!st.save.story.started) {
    st.update((s) => void (s.story.started = true));
    st.playScene('prologue', PROLOGUE, go);
  } else go();
}

/** the conversation after a won duel, then back to the map */
export function finishChapter(ch: Chapter) {
  const st = useStore.getState();
  if (st.save.story.scenes) st.playScene(`${ch.id}:after`, ch.after, () => st.go('story'));
  else st.go('story');
}

/** retry after a defeat; the first loss of a chapter gets a short scene */
const lossSeen = new Set<string>();
export function retryChapter(ch: Chapter) {
  const st = useStore.getState();
  if (ch.lose && st.save.story.scenes && !lossSeen.has(ch.id)) {
    lossSeen.add(ch.id);
    st.playScene(`${ch.id}:lose`, ch.lose, () => beginDuel(ch));
  } else beginDuel(ch);
}

export function replayScene(id: string, label: 'prologue' | 'before' | 'after', ch?: Chapter) {
  const st = useStore.getState();
  const beats = label === 'prologue' ? PROLOGUE : label === 'before' ? ch!.before : ch!.after;
  st.playScene(`replay:${id}`, beats, () => st.go('story'));
}
