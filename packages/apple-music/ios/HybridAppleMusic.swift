import AudioToolbox
import CoreAudio
import Foundation
import MusicKit
import NitroModules

final class HybridAppleMusic: HybridAppleMusicSpec {
  private var developerToken: String?
  private var userToken: String?
  private var currentTrackId: String?
  private var currentArtworkUrl: String?
  private var currentDurationSeconds = 0.0
  private var wasPlaying = false

  override init() {
    super.init()
  }

  func getAvailability() throws -> AppleMusicAvailability {
    guard #available(macOS 14.0, *) else {
      return AppleMusicAvailability(
        available: false,
        message: "Apple Music playback requires macOS 14 or newer."
      )
    }
    return AppleMusicAvailability(available: true, message: "Apple Music is available.")
  }

  func getDeveloperToken() throws -> Promise<String> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw AppleMusicError.unavailable }
      return try await self.resolveDeveloperToken(provided: nil)
    }
  }

  func authorize() throws -> Promise<AppleMusicAuthorization> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw AppleMusicError.unavailable }
      guard #available(macOS 12.0, *) else { throw AppleMusicError.unsupported }

      let status = await MusicAuthorization.request()
      guard status == .authorized else {
        throw AppleMusicError.authorizationDenied
      }

      let developerToken = try await self.resolveDeveloperToken(provided: nil)
      let userToken: String
      do {
        userToken = try await MusicUserTokenProvider().userToken(for: developerToken, options: [])
      } catch {
        throw AppleMusicError.actionFailed(
          "Apple Music could not create a user token. Enable MusicKit for this app's App ID, sign with that Apple Developer team, then try again. \(error.localizedDescription)"
        )
      }

      self.developerToken = developerToken
      self.userToken = userToken
      let storefront = try await self.fetchStorefront(developerToken: developerToken, userToken: userToken) ?? ""
      let subscription = await self.fetchSubscriptionLabel() ?? ""
      return AppleMusicAuthorization(
        developerToken: developerToken,
        userToken: userToken,
        storefront: storefront,
        userName: "Apple Music",
        subscription: subscription
      )
    }
  }

  func configure(developerToken: String, userToken: String) throws -> Promise<Void> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw AppleMusicError.unavailable }
      self.developerToken = try await self.resolveDeveloperToken(provided: developerToken)
      self.userToken = userToken.isEmpty ? nil : userToken
    }
  }

  func logout() throws -> Promise<Void> {
    Promise.async { @MainActor [weak self] in
      guard let self else { return }
      if #available(macOS 14.0, *) {
        ApplicationMusicPlayer.shared.stop()
      }
      self.developerToken = nil
      self.userToken = nil
      self.resetTrackState()
    }
  }

  func loadTrack(trackId: String, startPositionSeconds: Double) throws -> Promise<Void> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw AppleMusicError.unavailable }
      guard #available(macOS 14.0, *) else { throw AppleMusicError.unsupported }
      guard !trackId.isEmpty else { throw AppleMusicError.missingTrack }

      var request = MusicCatalogResourceRequest<Song>(
        matching: \SongFilter.id,
        equalTo: MusicItemID(trackId)
      )
      request.limit = 1
      let response = try await request.response()
      guard let song = response.items.first else {
        throw AppleMusicError.actionFailed("Apple Music could not find this track in your storefront.")
      }

      self.currentTrackId = trackId
      self.currentDurationSeconds = song.duration ?? 0
      self.currentArtworkUrl = song.artwork?.url(width: 400, height: 400)?.absoluteString
      self.wasPlaying = false

      let player = ApplicationMusicPlayer.shared
      player.queue = ApplicationMusicPlayer.Queue(for: [song])
      if startPositionSeconds > 0 {
        player.playbackTime = startPositionSeconds
      }
      do {
        try await player.play()
      } catch {
        throw AppleMusicError.actionFailed(
          "Apple Music could not play this track. Check your subscription and internet connection, then try again. \(error.localizedDescription)"
        )
      }
    }
  }

  func play() throws -> Promise<Void> {
    Promise.async { @MainActor in
      guard #available(macOS 14.0, *) else { throw AppleMusicError.unsupported }
      do {
        try await ApplicationMusicPlayer.shared.play()
      } catch {
        throw AppleMusicError.actionFailed(
          "Apple Music could not resume playback. Reconnect Apple Music in Settings and try again. \(error.localizedDescription)"
        )
      }
    }
  }

  func pause() throws -> Promise<Void> {
    Promise.async { @MainActor in
      guard #available(macOS 14.0, *) else { throw AppleMusicError.unsupported }
      ApplicationMusicPlayer.shared.pause()
    }
  }

  func seek(positionSeconds: Double) throws -> Promise<Void> {
    Promise.async { @MainActor in
      guard #available(macOS 14.0, *) else { throw AppleMusicError.unsupported }
      ApplicationMusicPlayer.shared.playbackTime = max(0, positionSeconds)
    }
  }

  func setVolume(volume: Double) throws -> Promise<Void> {
    Promise.parallel {
      let clamped = Float32(max(0, min(1, volume.isFinite ? volume : 0)))
      guard Self.setSystemVolume(clamped) else {
        throw AppleMusicError.actionFailed(
          "Volume control is unavailable for the current output device. Adjust it from Control Center instead."
        )
      }
    }
  }

  func stop() throws -> Promise<Void> {
    Promise.async { @MainActor [weak self] in
      guard #available(macOS 14.0, *) else { return }
      ApplicationMusicPlayer.shared.stop()
      self?.resetTrackState()
    }
  }

  func getPlaybackState() throws -> Promise<AppleMusicPlaybackState> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw AppleMusicError.unavailable }
      guard #available(macOS 14.0, *) else { throw AppleMusicError.unsupported }
      let player = ApplicationMusicPlayer.shared
      let isPlaying = player.state.playbackStatus == .playing
      let position = player.playbackTime
      let didComplete = self.wasPlaying
        && player.state.playbackStatus == .stopped
        && self.currentTrackId != nil
      self.wasPlaying = isPlaying

      return AppleMusicPlaybackState(
        trackId: self.currentTrackId ?? "",
        isPlaying: isPlaying,
        isLoading: !player.isPreparedToPlay && self.currentTrackId != nil,
        positionSeconds: position,
        durationSeconds: self.currentDurationSeconds,
        artworkUrl: self.currentArtworkUrl ?? "",
        didComplete: didComplete,
        error: ""
      )
    }
  }

  @MainActor
  private func resetTrackState() {
    currentTrackId = nil
    currentArtworkUrl = nil
    currentDurationSeconds = 0
    wasPlaying = false
  }

  @available(macOS 12.0, *)
  @MainActor
  private func resolveDeveloperToken(provided: String?) async throws -> String {
    if let provided = provided?.trimmingCharacters(in: .whitespacesAndNewlines), !provided.isEmpty {
      developerToken = provided
      return provided
    }
    if let cached = developerToken, !cached.isEmpty {
      return cached
    }

    do {
      let tokenProvider = DefaultMusicTokenProvider()
      MusicDataRequest.tokenProvider = tokenProvider
      let token = try await tokenProvider.developerToken(options: [])
      developerToken = token
      return token
    } catch {
      throw AppleMusicError.actionFailed(
        "Apple Music could not create a developer token. Enable MusicKit for this app's App ID, sign with that Apple Developer team, then try again. \(error.localizedDescription)"
      )
    }
  }

  @available(macOS 12.0, *)
  @MainActor
  private func fetchStorefront(developerToken: String, userToken: String) async throws -> String? {
    guard let url = URL(string: "https://api.music.apple.com/v1/me/storefront") else { return nil }
    var request = URLRequest(url: url)
    request.addValue("Bearer \(developerToken)", forHTTPHeaderField: "Authorization")
    request.addValue(userToken, forHTTPHeaderField: "Music-User-Token")
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let items = json?["data"] as? [[String: Any]]
    return items?.first?["id"] as? String
  }

  @available(macOS 12.0, *)
  @MainActor
  private func fetchSubscriptionLabel() async -> String? {
    do {
      let subscription = try await MusicSubscription.current
      if subscription.canPlayCatalogContent { return "Apple Music" }
      if subscription.canBecomeSubscriber { return "Not Subscribed" }
    } catch {
      return nil
    }
    return nil
  }

  private static func setSystemVolume(_ volume: Float32) -> Bool {
    var deviceId = AudioDeviceID(0)
    var deviceAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    var deviceSize = UInt32(MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &deviceAddress,
      0,
      nil,
      &deviceSize,
      &deviceId
    ) == noErr, deviceId != 0 else { return false }

    func apply(selector: AudioObjectPropertySelector, element: AudioObjectPropertyElement) -> Bool {
      var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: element
      )
      guard AudioObjectHasProperty(deviceId, &address) else { return false }
      var isSettable: DarwinBoolean = false
      guard AudioObjectIsPropertySettable(deviceId, &address, &isSettable) == noErr,
            isSettable.boolValue else { return false }
      var value = volume
      return AudioObjectSetPropertyData(
        deviceId,
        &address,
        0,
        nil,
        UInt32(MemoryLayout<Float32>.size),
        &value
      ) == noErr
    }

    if apply(selector: kAudioHardwareServiceDeviceProperty_VirtualMainVolume, element: kAudioObjectPropertyElementMain) {
      return true
    }
    return apply(selector: kAudioDevicePropertyVolumeScalar, element: 1)
      || apply(selector: kAudioDevicePropertyVolumeScalar, element: 2)
  }
}

private enum AppleMusicError {
  static let unavailable = RuntimeError("Apple Music became unavailable. Restart the app and try again.")
  static let unsupported = RuntimeError("Apple Music playback requires macOS 14 or newer.")
  static let authorizationDenied = RuntimeError(
    "Apple Music access was denied. Allow Media & Apple Music in System Settings → Privacy & Security, then try again."
  )
  static let missingTrack = RuntimeError(
    "This Apple Music track is missing an ID. Search for it again, then retry playback."
  )

  static func actionFailed(_ message: String) -> RuntimeError {
    RuntimeError(message)
  }
}
