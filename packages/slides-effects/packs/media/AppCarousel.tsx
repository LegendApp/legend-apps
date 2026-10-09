import { CarouselBlurView } from "./CarouselBlurView";
import { FilmstripMotionView } from "./FilmstripMotionView";
import { ProgressivePreparation, SnapshotCaptureBoundary, SceneMotionView, usePlaybackTween, usePresentationValue, usePlayback } from "@legend-apps/presentation";
import { useState, type ReactNode } from "react";
import { makeMutable, runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { carouselCardLayout, type CarouselGeometry, type SceneMode } from "./CarouselGeometry";
import { RecordingPositionContext } from "./RecordingPosition";
type CardLayout = ReturnType<typeof carouselCardLayout> & { height: number; captionHeight: number };

/** Shared step-controlled carousel; interpolation and exit motion run on the UI thread. */
export function AppCarousel<T extends string>({ items, position, mode = "filmstrip", cardWidth = 1180, geometry = {}, animateExit = true, renderCard, renderOverlay, getBlurPoster, getBlurPosterCaption }: {
  items: readonly T[];
  position: number;
  mode?: SceneMode;
  cardWidth?: number;
  geometry?: Omit<CarouselGeometry, "count">;
  animateExit?: boolean;
  renderCard: (id: T, layout: CardLayout) => ReactNode;
  getBlurPoster?: (id: T) => string | undefined;
  getBlurPosterCaption?: (id: T) => string;
  renderOverlay?: (id: T, index: number) => ReactNode;
}) {
  const centerX = geometry.centerX ?? 960, centerY = geometry.centerY ?? 555, spacing = geometry.spacing ?? 900;
  const selected = Math.max(0, Math.min(items.length - 1, position));
  const progress = usePlaybackTween({ position: selected }, 500);
  const playback = usePlayback();
  const phase = usePresentationValue("playbackPhase");
  const first = Math.max(0, selected - 1), last = Math.min(items.length - 1, selected + 1);
  const [window, setWindow] = useState(() => ({ selected, mode, first, last, settled: true }));
  const [positions, setPositions] = useState(() => new Map(items.map(id => [id, makeMutable(0)])));
  if (positions.size !== items.length || items.some(id => !positions.has(id))) {
    setPositions(new Map(items.map(id => [id, positions.get(id) ?? makeMutable(0)])));
  }
  if (window.selected !== selected || window.mode !== mode) {
    const staticPose = phase === "preview" || phase === "preparing";
    const keepAll = !staticPose && window.mode !== "filmstrip";
    setWindow({ selected, mode, settled: staticPose,
      first: keepAll ? 0 : staticPose ? first : Math.min(window.first, first),
      last: keepAll ? items.length - 1 : staticPose ? last : Math.max(window.last, last) });
  }
  const settle = () => setWindow(current => current === window && !current.settled
    ? { ...current, first, last, settled: true } : current);
  useAnimatedReaction(() => {
    "worklet";
    const clock = playback.value;
    return !window.settled && (clock.phase === "preview" || clock.phase === "preparing" ||
      clock.phase === "playing" && clock.stepTime >= 0.65 && Math.abs(progress.value.position - selected) < 0.001);
  }, ready => { "worklet"; if (ready) runOnJS(settle)(); }, [window, selected]);
  const visible = items.flatMap((id, index) => mode === "filmstrip" && (index < window.first || index > window.last) ? [] : [{ id, index }]);
  return <SnapshotCaptureBoundary suspended={phase === "playing" && !window.settled}><ProgressivePreparation>{visible.map(({ id, index }) => {

    const card = carouselCardLayout(index, mode, 0, cardWidth, { ...geometry, count: items.length });
    const height = cardWidth * 0.625;
    return <FilmstripMotionView key={id} index={index} enabled={mode === "filmstrip"} animateExit={animateExit} spacing={spacing} progress={progress}
      style={{ position: "absolute", left: centerX - cardWidth / 2, top: centerY - height / 2,
        width: cardWidth, height, zIndex: card.depth }}>
      <SceneMotionView duration={550} pose={{ x: card.x - (centerX + index * spacing), y: card.y - centerY,
        scaleX: card.width / cardWidth, scaleY: card.width / cardWidth }} style={{ flex: 1 }}>
        <CarouselBlurView progress={progress} index={index} enabled={mode === "filmstrip"}
          poster={getBlurPoster?.(id)} posterTop={cardWidth * 0.0625} posterCaption={getBlurPosterCaption?.(id)}>
        <RecordingPositionContext.Provider value={positions.get(id)}>
          {renderCard(id, { ...card, width: cardWidth, height, captionHeight: cardWidth * 0.0625 })}
        </RecordingPositionContext.Provider>
        </CarouselBlurView>
      </SceneMotionView>
    </FilmstripMotionView>;
  })}</ProgressivePreparation>{renderOverlay && visible.map(({ id, index }) => renderOverlay(id, index))}</SnapshotCaptureBoundary>;
}

