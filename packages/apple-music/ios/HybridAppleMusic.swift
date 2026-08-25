import AudioToolbox
import CoreAudio
import Foundation
import MusicKit
import NitroModules

final class HybridAppleMusic: HybridAppleMusicSpec {
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

  func getAuthorization() throws -> Promise<AppleMusicAuthorization> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw AppleMusicError.unavailable }
      guard #available(macOS 12.0, *) else { throw AppleMusicError.unsupported }
      return try await self.authorizationDetails(status: MusicAuthorization.currentStatus)
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

      return try await self.authorizationDetails(status: status)
    }
  }

  func request(path: String) throws -> Promise<String> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw AppleMusicError.unavailable }
      guard #available(macOS 12.0, *) else { throw AppleMusicError.unsupported }
      guard MusicAuthorization.currentStatus == .authorized else {
        throw AppleMusicError.authorizationDenied
      }
      let response = try await self.musicData(path: path)
      guard let json = String(data: response.data, encoding: .utf8) else {
        throw AppleMusicError.actionFailed(
          "Apple Music returned an unreadable response. Check your connection and try again."
        )
      }
      return json
    }
  }

  func logout() throws -> Promise<Void> {
    Promise.async { @MainActor [weak self] in
      guard let self else { return }
      if #available(macOS 14.0, *) {
        ApplicationMusicPlayer.shared.stop()
      }
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
  private func authorizationDetails(status: MusicAuthorization.Status) async throws -> AppleMusicAuthorization {
    guard status == .authorized else {
      return AppleMusicAuthorization(
        authorized: false,
        status: status.rawValue,
        storefront: "",
        userName: "",
        subscription: ""
      )
    }

    let storefront = try await fetchStorefront() ?? ""
    let subscription = await fetchSubscriptionLabel() ?? ""
    return AppleMusicAuthorization(
      authorized: true,
      status: status.rawValue,
      storefront: storefront,
      userName: "Apple Music",
      subscription: subscription
    )
  }

  @available(macOS 12.0, *)
  @MainActor
  private func fetchStorefront() async throws -> String? {
    let response = try await musicData(path: "/v1/me/storefront")
    let json = try JSONSerialization.jsonObject(with: response.data) as? [String: Any]
    let items = json?["data"] as? [[String: Any]]
    return items?.first?["id"] as? String
  }

  @available(macOS 12.0, *)
  @MainActor
  private func musicData(path: String) async throws -> MusicDataResponse {
    let url: URL?
    if path.hasPrefix("https://") {
      url = URL(string: path)
    } else if path.hasPrefix("/v1/") {
      url = URL(string: "https://api.music.apple.com\(path)")
    } else {
      url = nil
    }
    guard let url, url.scheme == "https", url.host == "api.music.apple.com" else {
      throw AppleMusicError.invalidRequest
    }

    MusicDataRequest.tokenProvider = DefaultMusicTokenProvider()
    do {
      return try await MusicDataRequest(urlRequest: URLRequest(url: url)).response()
    } catch {
      throw AppleMusicError.dataRequestFailure(error)
    }
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
  static let invalidRequest = RuntimeError(
    "Apple Music rejected an invalid catalog request. Search for the item again, then retry."
  )

  static func actionFailed(_ message: String) -> RuntimeError {
    RuntimeError(message)
  }

  static func dataRequestFailure(_ error: Error) -> RuntimeError {
    if let requestError = error as? MusicDataRequest.Error {
      switch requestError.status {
      case 401, 403:
        return RuntimeError(
          "Apple Music authorization expired. Reconnect Apple Music in Settings → Apple Music, then try again."
        )
      case 404:
        return RuntimeError(
          "Apple Music could not find that item in your storefront. Search for it again, then retry."
        )
      case 429:
        return RuntimeError(
          "Apple Music is rate-limiting requests. Wait a minute, then try again."
        )
      default:
        break
      }
    }

    let bundleId = Bundle.main.bundleIdentifier ?? "this app's bundle ID"
    let details = errorDetails(error)
    if details.localizedCaseInsensitiveContains("client not found") || details.contains("40402") {
      return RuntimeError(
        "Apple's MusicKit service has not registered \(bundleId) yet. If you just created or updated the App ID, wait a few minutes, restart Legend Music, and try again. If it still fails, open Apple Developer → Certificates, Identifiers & Profiles → \(bundleId) → App Services, confirm MusicKit is enabled, and save it again."
      )
    }

    return RuntimeError(
      "Apple Music could not finish the request. Check your internet connection and subscription, then try again. If this is the first connection for \(bundleId), confirm MusicKit is enabled for that exact App ID and restart Legend Music. \(error.localizedDescription)"
    )
  }

  private static func errorDetails(_ error: Error) -> String {
    let nsError = error as NSError
    var details = [String(describing: error), nsError.localizedDescription]
    if let debugDescription = nsError.userInfo[NSDebugDescriptionErrorKey] as? String {
      details.append(debugDescription)
    }
    if let underlyingError = nsError.userInfo[NSUnderlyingErrorKey] as? Error {
      details.append(errorDetails(underlyingError))
    }
    return details.joined(separator: " | ")
  }
}
