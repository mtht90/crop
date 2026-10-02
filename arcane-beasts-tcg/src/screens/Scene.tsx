import { useStore } from '../state/store';
import { castFor } from '../story';
import { StoryPlayer } from '../story/StoryPlayer';

/** full-screen visual-novel scene; what happens afterwards is decided by `scene.then` */
export function Scene() {
  const scene = useStore((s) => s.scene);
  const markScene = useStore((s) => s.markScene);
  const go = useStore((s) => s.go);
  const hero = useStore((s) => s.save.story.hero);
  if (!scene) {
    // nothing to play (e.g. after a reload): back to the map
    queueMicrotask(() => useStore.getState().screen === 'scene' && go('story'));
    return null;
  }
  return (
    <StoryPlayer
      key={scene.id}
      beats={scene.beats}
      cast={castFor(hero)}
      label={scene.id}
      onDone={() => {
        if (!scene.id.startsWith('replay:')) markScene(scene.id);
        useStore.setState({ scene: null });
        scene.then();
      }}
    />
  );
}
