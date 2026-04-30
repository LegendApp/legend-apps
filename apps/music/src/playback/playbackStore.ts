import {
  addAudioPlayerListener,
  clearNowPlayingInfo,
  getCurrentState,
  loadTrack,
  pause,
  play,
  seek,
  setVolume,
  stop,
  updateNowPlayingInfo,
  type RemoteCommand,
} from "@legend-desktop/audio-player";
import { getStoredString, setStoredString } from "@legend-desktop/app-storage";
import { createQueueItemId } from "../domain/musicIds";
import { createEmptyPlaybackState, type MusicId, type MusicPlaybackState, type MusicQueueItem, type MusicTrack, type RepeatMode } from "../domain/musicModel";
import { getMusicLibrarySnapshot, loadMusicLibrary } from "../library/libraryStore";

const STORAGE_KEY = "music.playback.v1";

type PlaybackSnapshot = Readonly<{
  currentTrackId?: MusicId;
  queueTrackIds?: MusicId[];
  repeatMode?: RepeatMode;
  shuffleEnabled?: boolean;
  volume?: number;
}>;

const subscribers = new Set<() => void>();
let state = createEmptyPlaybackState();
let initialized = false;
let loadToken = 0;

function emit() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

function setPlaybackState(nextState: MusicPlaybackState, persist = false) {
  state = nextState;
  emit();

  if (persist) {
    void persistPlaybackState();
  }

  return state;
}

function currentIndex(playback = state) {
  if (!playback.currentItemId) {
    return -1;
  }
  return playback.queue.findIndex((item) => item.id === playback.currentItemId);
}

function makeQueue(trackIds: readonly MusicId[], now = Date.now()): MusicQueueItem[] {
  return trackIds.map((trackId, index) => ({
    id: createQueueItemId(trackId, now + index),
    queuedAt: now + index,
    trackId,
  }));
}

function getTrack(trackId: MusicId): MusicTrack | undefined {
  return getMusicLibrarySnapshot().tracksById[trackId];
}

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return state.volume;
  }
  return Math.max(0, Math.min(1, volume));
}

function snapshotFromState(): PlaybackSnapshot {
  const current = state.queue.find((item) => item.id === state.currentItemId);
  return {
    currentTrackId: current?.trackId,
    queueTrackIds: state.queue.map((item) => item.trackId),
    repeatMode: state.repeatMode,
    shuffleEnabled: state.shuffleEnabled,
    volume: state.volume,
  };
}

async function persistPlaybackState() {
  await setStoredString(STORAGE_KEY, JSON.stringify(snapshotFromState()));
}

function parsePlaybackSnapshot(json: string | null): PlaybackSnapshot {
  if (!json) {
    return {};
  }

  try {
    const parsed = JSON.parse(json) as Partial<PlaybackSnapshot>;
    return {
      currentTrackId: typeof parsed.currentTrackId === "string" ? parsed.currentTrackId : undefined,
      queueTrackIds: Array.isArray(parsed.queueTrackIds)
        ? parsed.queueTrackIds.filter((item): item is MusicId => typeof item === "string")
        : undefined,
      repeatMode: parsed.repeatMode === "all" || parsed.repeatMode === "one" ? parsed.repeatMode : "off",
      shuffleEnabled: Boolean(parsed.shuffleEnabled),
      volume: typeof parsed.volume === "number" && Number.isFinite(parsed.volume) ? clampVolume(parsed.volume) : undefined,
    };
  } catch {
    return {};
  }
}

function updateNowPlaying(track?: MusicTrack, playback = state) {
  if (!track) {
    clearNowPlayingInfo();
    return;
  }

  updateNowPlayingInfo({
    album: track.metadata.album,
    artist: track.metadata.artist,
    duration: playback.durationSeconds || track.metadata.durationSeconds,
    elapsedTime: playback.positionSeconds,
    isPlaying: playback.status === "playing",
    playbackRate: playback.status === "playing" ? 1 : 0,
    title: track.metadata.title,
  });
}

async function loadQueueItem(item: MusicQueueItem, shouldPlay: boolean) {
  const token = ++loadToken;
  const track = getTrack(item.trackId);

  if (!track) {
    setPlaybackState({
      ...state,
      currentItemId: item.id,
      error: "Track is no longer in the library.",
      status: "error",
    }, true);
    return;
  }

  setPlaybackState({
    ...state,
    currentItemId: item.id,
    durationSeconds: track.metadata.durationSeconds ?? 0,
    error: undefined,
    positionSeconds: 0,
    status: "loading",
  }, true);

  const loaded = await loadTrack(track.source.filePath);
  if (token !== loadToken) {
    return;
  }

  if (!loaded.success) {
    setPlaybackState({
      ...state,
      error: loaded.error ?? "Failed to load track.",
      status: "error",
    }, true);
    return;
  }

  updateNowPlaying(track, state);

  if (shouldPlay) {
    const played = await play();
    if (token !== loadToken) {
      return;
    }
    setPlaybackState({
      ...state,
      error: played.success ? undefined : played.error,
      status: played.success ? "playing" : "error",
    }, true);
    updateNowPlaying(track, { ...state, status: played.success ? "playing" : "error" });
  } else {
    setPlaybackState({
      ...state,
      status: "paused",
    }, true);
  }
}

function nextIndexFromState(playback: MusicPlaybackState, allowWrap: boolean) {
  if (playback.queue.length === 0) {
    return -1;
  }

  if (playback.shuffleEnabled && playback.queue.length > 1) {
    const index = currentIndex(playback);
    let nextIndex = Math.floor(Math.random() * playback.queue.length);
    if (nextIndex === index) {
      nextIndex = (nextIndex + 1) % playback.queue.length;
    }
    return nextIndex;
  }

  const index = currentIndex(playback);
  const nextIndex = index + 1;
  if (nextIndex < playback.queue.length) {
    return nextIndex;
  }

  return allowWrap ? 0 : -1;
}

function previousIndexFromState(playback: MusicPlaybackState) {
  if (playback.queue.length === 0) {
    return -1;
  }

  const index = currentIndex(playback);
  if (index > 0) {
    return index - 1;
  }

  return playback.repeatMode === "all" ? playback.queue.length - 1 : -1;
}

async function handleCompletion() {
  if (state.repeatMode === "one" && state.currentItemId) {
    const item = state.queue.find((queueItem) => queueItem.id === state.currentItemId);
    if (item) {
      await loadQueueItem(item, true);
      return;
    }
  }

  const nextIndex = nextIndexFromState(state, state.repeatMode === "all");
  if (nextIndex >= 0) {
    await loadQueueItem(state.queue[nextIndex], true);
  } else {
    await stop();
    setPlaybackState({
      ...state,
      positionSeconds: 0,
      status: "stopped",
    }, true);
  }
}

async function handleRemoteCommand(command: RemoteCommand) {
  if (command === "play") {
    await resumePlayback();
  } else if (command === "pause") {
    await pausePlayback();
  } else if (command === "toggle") {
    await togglePlayback();
  } else if (command === "next") {
    await skipNext();
  } else if (command === "previous") {
    await skipPrevious();
  }
}

function subscribeNativeEvents() {
  addAudioPlayerListener("onCompletion", () => {
    void handleCompletion();
  });
  addAudioPlayerListener("onLoadError", (event) => {
    setPlaybackState({
      ...state,
      error: event.error,
      status: "error",
    }, true);
  });
  addAudioPlayerListener("onLoadSuccess", (event) => {
    setPlaybackState({
      ...state,
      durationSeconds: event.duration,
    });
  });
  addAudioPlayerListener("onPlaybackStateChanged", (event) => {
    const status = event.isPlaying ? "playing" : state.status === "loading" ? "loading" : "paused";
    setPlaybackState({
      ...state,
      status,
    });
    const current = state.queue.find((item) => item.id === state.currentItemId);
    updateNowPlaying(current ? getTrack(current.trackId) : undefined, state);
  });
  addAudioPlayerListener("onProgress", (event) => {
    setPlaybackState({
      ...state,
      durationSeconds: event.duration,
      positionSeconds: event.currentTime,
    });
  });
  addAudioPlayerListener("onRemoteCommand", (event) => {
    void handleRemoteCommand(event.command);
  });
}

export function getPlaybackSnapshot() {
  return state;
}

export function subscribePlayback(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export async function initializePlayback() {
  if (initialized) {
    return state;
  }

  initialized = true;
  subscribeNativeEvents();

  await loadMusicLibrary();

  const [saved, nativeState] = await Promise.all([
    getStoredString(STORAGE_KEY).then(parsePlaybackSnapshot),
    getCurrentState(),
  ]);
  const validTrackIds = (saved.queueTrackIds ?? []).filter((trackId) => Boolean(getTrack(trackId)));
  const queue = makeQueue(validTrackIds);
  const currentItem = saved.currentTrackId ? queue.find((item) => item.trackId === saved.currentTrackId) : undefined;
  const volume = saved.volume ?? nativeState.volume ?? 1;

  setPlaybackState({
    ...state,
    currentItemId: currentItem?.id,
    durationSeconds: nativeState.duration ?? 0,
    positionSeconds: nativeState.currentTime ?? 0,
    queue,
    repeatMode: saved.repeatMode ?? "off",
    shuffleEnabled: saved.shuffleEnabled ?? false,
    status: nativeState.isPlaying ? "playing" : currentItem ? "paused" : "idle",
    volume,
  });
  await setVolume(volume);

  if (currentItem) {
    await loadQueueItem(currentItem, nativeState.isPlaying);
  }

  return state;
}

export async function playTrackNow(trackId: MusicId, contextTrackIds: readonly MusicId[] = []) {
  const trackIds = contextTrackIds.length > 0 ? contextTrackIds : [trackId];
  const queue = makeQueue(trackIds.filter((id) => Boolean(getTrack(id))));
  const current = queue.find((item) => item.trackId === trackId) ?? queue[0];
  if (!current) {
    return state;
  }

  setPlaybackState({
    ...state,
    currentItemId: current.id,
    queue,
  }, true);
  await loadQueueItem(current, true);
  return state;
}

export function enqueueTrack(trackId: MusicId) {
  if (!getTrack(trackId)) {
    return state;
  }

  const queuedAt = Date.now();
  return setPlaybackState({
    ...state,
    queue: [
      ...state.queue,
      {
        id: createQueueItemId(trackId, queuedAt),
        queuedAt,
        trackId,
      },
    ],
  }, true);
}

export function playTrackNext(trackId: MusicId) {
  if (!getTrack(trackId)) {
    return state;
  }

  const queuedAt = Date.now();
  const item = {
    id: createQueueItemId(trackId, queuedAt),
    queuedAt,
    trackId,
  };
  const index = currentIndex();
  const queue = [...state.queue];
  queue.splice(index >= 0 ? index + 1 : 0, 0, item);
  return setPlaybackState({
    ...state,
    queue,
  }, true);
}

export async function resumePlayback() {
  if (!state.currentItemId) {
    const firstItem = state.queue[0];
    if (firstItem) {
      await loadQueueItem(firstItem, true);
    }
    return state;
  }

  const result = await play();
  setPlaybackState({
    ...state,
    error: result.success ? undefined : result.error,
    status: result.success ? "playing" : "error",
  }, true);
  return state;
}

export async function pausePlayback() {
  const result = await pause();
  setPlaybackState({
    ...state,
    error: result.success ? undefined : result.error,
    status: result.success ? "paused" : "error",
  }, true);
  return state;
}

export async function togglePlayback() {
  return state.status === "playing" ? pausePlayback() : resumePlayback();
}

export async function skipNext() {
  const nextIndex = nextIndexFromState(state, state.repeatMode === "all");
  if (nextIndex >= 0) {
    await loadQueueItem(state.queue[nextIndex], true);
  }
  return state;
}

export async function skipPrevious() {
  if (state.positionSeconds > 5 && state.currentItemId) {
    await seekPlayback(0);
    return state;
  }

  const previousIndex = previousIndexFromState(state);
  if (previousIndex >= 0) {
    await loadQueueItem(state.queue[previousIndex], true);
  }
  return state;
}

export async function seekPlayback(seconds: number) {
  const nextPosition = Math.max(0, seconds);
  const result = await seek(nextPosition);
  setPlaybackState({
    ...state,
    error: result.success ? undefined : result.error,
    positionSeconds: result.success ? nextPosition : state.positionSeconds,
    status: result.success ? state.status : "error",
  }, false);
  return state;
}

export async function setPlaybackVolume(volume: number) {
  const nextVolume = clampVolume(volume);
  const result = await setVolume(nextVolume);
  setPlaybackState({
    ...state,
    error: result.success ? undefined : result.error,
    status: result.success ? state.status : "error",
    volume: nextVolume,
  }, true);
  return state;
}

export function setRepeatMode(repeatMode: RepeatMode) {
  return setPlaybackState({
    ...state,
    repeatMode,
  }, true);
}

export function toggleShuffle() {
  return setPlaybackState({
    ...state,
    shuffleEnabled: !state.shuffleEnabled,
  }, true);
}

export function removeQueueItem(itemId: MusicId) {
  const removingCurrent = state.currentItemId === itemId;
  const queue = state.queue.filter((item) => item.id !== itemId);
  const nextCurrentItem = removingCurrent ? queue[Math.min(currentIndex(), queue.length - 1)] : undefined;

  setPlaybackState({
    ...state,
    currentItemId: removingCurrent ? nextCurrentItem?.id : state.currentItemId,
    queue,
    status: queue.length === 0 ? "idle" : state.status,
  }, true);

  if (removingCurrent && nextCurrentItem) {
    void loadQueueItem(nextCurrentItem, state.status === "playing");
  } else if (queue.length === 0) {
    void stop();
    clearNowPlayingInfo();
  }

  return state;
}
