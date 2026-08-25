import Foundation
import Network
import NitroModules

final class HybridOAuthLoopback: HybridOAuthLoopbackSpec {
  private var listener: NWListener?
  private var callbackPath = ""
  private var callbackUrl: String?

  override init() {
    super.init()
  }

  func start(callbackPath: String) throws -> Promise<String> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw OAuthLoopbackError.unavailable }
      self.stopListener()
      self.callbackPath = Self.normalizePath(callbackPath)

      let parameters = NWParameters.tcp
      parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
      let listener = try NWListener(using: parameters)
      self.listener = listener

      return try await withCheckedThrowingContinuation { continuation in
        var didResume = false
        listener.stateUpdateHandler = { [weak self, weak listener] state in
          Task { @MainActor in
            guard let self, let listener, self.listener === listener else { return }
            switch state {
            case .ready:
              guard !didResume, let port = listener.port else { return }
              didResume = true
              continuation.resume(returning: "http://127.0.0.1:\(port.rawValue)\(self.callbackPath)")
            case .failed(let error):
              self.stopListener()
              if !didResume {
                didResume = true
                continuation.resume(throwing: OAuthLoopbackError.listenerFailed(error.localizedDescription))
              }
            case .cancelled:
              if !didResume {
                didResume = true
                continuation.resume(throwing: OAuthLoopbackError.cancelled)
              }
            default:
              break
            }
          }
        }
        listener.newConnectionHandler = { [weak self] connection in
          self?.receive(connection)
        }
        listener.start(queue: .global(qos: .userInitiated))
      }
    }
  }

  func waitForCallback(timeoutMs: Double) throws -> Promise<String> {
    Promise.async { @MainActor [weak self] in
      guard let self else { throw OAuthLoopbackError.unavailable }
      guard self.listener != nil else { throw OAuthLoopbackError.notRunning }
      let timeoutNanoseconds = UInt64(max(1, timeoutMs) * 1_000_000)

      return try await withThrowingTaskGroup(of: String.self) { group in
        group.addTask { @MainActor [weak self] in
          while let self, self.listener != nil {
            if let callbackUrl = self.callbackUrl {
              return callbackUrl
            }
            try await Task.sleep(nanoseconds: 20_000_000)
          }
          throw OAuthLoopbackError.cancelled
        }
        group.addTask {
          try await Task.sleep(nanoseconds: timeoutNanoseconds)
          throw OAuthLoopbackError.timedOut
        }
        guard let result = try await group.next() else { throw OAuthLoopbackError.cancelled }
        group.cancelAll()
        self.stopListener()
        return result
      }
    }
  }

  func cancel() throws {
    Task { @MainActor [weak self] in
      self?.stopListener()
    }
  }

  private func receive(_ connection: NWConnection) {
    connection.start(queue: .global(qos: .userInitiated))
    connection.receive(minimumIncompleteLength: 1, maximumLength: 32_768) { [weak self] data, _, _, error in
      guard let self else {
        connection.cancel()
        return
      }
      guard error == nil,
            let data,
            let request = String(data: data, encoding: .utf8),
            let requestTarget = Self.requestTarget(from: request) else {
        self.respond(to: connection, status: "400 Bad Request", body: "Legend Music could not read the Spotify callback.")
        return
      }

      Task { @MainActor [weak self] in
        guard let self else { return }
        let components = requestTarget.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        guard String(components[0]) == self.callbackPath else {
          self.respond(to: connection, status: "404 Not Found", body: "This callback does not belong to Legend Music.")
          return
        }
        self.callbackUrl = "http://127.0.0.1\(requestTarget)"
        self.respond(to: connection, status: "200 OK", body: "Spotify is connected. You can close this tab and return to Legend Music.")
      }
    }
  }

  private func respond(to connection: NWConnection, status: String, body: String) {
    let escapedBody = body
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
    let html = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Legend Music</title></head><body style=\"font:16px -apple-system;padding:40px;max-width:560px\"><h1>Legend Music</h1><p>\(escapedBody)</p></body></html>"
    let response = "HTTP/1.1 \(status)\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(html.utf8.count)\r\nConnection: close\r\n\r\n\(html)"
    connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
      connection.cancel()
    })
  }

  @MainActor
  private func stopListener() {
    listener?.cancel()
    listener = nil
    callbackUrl = nil
  }

  private static func normalizePath(_ path: String) -> String {
    let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "/callback" }
    return trimmed.hasPrefix("/") ? trimmed : "/\(trimmed)"
  }

  private static func requestTarget(from request: String) -> String? {
    guard let firstLine = request.components(separatedBy: "\r\n").first else { return nil }
    let parts = firstLine.split(separator: " ")
    guard parts.count >= 2, parts[0] == "GET" else { return nil }
    return String(parts[1])
  }
}

private enum OAuthLoopbackError: LocalizedError {
  case unavailable
  case notRunning
  case cancelled
  case timedOut
  case listenerFailed(String)

  var errorDescription: String? {
    switch self {
    case .unavailable:
      return "The OAuth callback listener is unavailable."
    case .notRunning:
      return "The OAuth callback listener is not running. Start sign-in again."
    case .cancelled:
      return "Spotify sign-in was cancelled. Start Connect again when you are ready."
    case .timedOut:
      return "Spotify sign-in timed out. Start Connect again and finish signing in within three minutes."
    case .listenerFailed(let detail):
      return "Legend Music could not start its local Spotify callback listener. \(detail)"
    }
  }
}
