import Foundation
import NitroModules
import Security

final class HybridSecureStorage: HybridSecureStorageSpec {
  override init() {
    super.init()
  }

  func get(service: String, key: String) throws -> String {
    var query = baseQuery(service: service, key: key)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return "" }
    guard status == errSecSuccess else {
      throw keychainError(status, operation: "read")
    }
    guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
      throw RuntimeError("Secure storage returned unreadable data. Reconnect the affected music service in Settings.")
    }
    return value
  }

  func set(service: String, key: String, value: String) throws {
    guard let data = value.data(using: .utf8) else {
      throw RuntimeError("Secure storage could not encode this credential. Reconnect the affected music service in Settings.")
    }
    let query = baseQuery(service: service, key: key)
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecSuccess { return }
    guard updateStatus == errSecItemNotFound else {
      throw keychainError(updateStatus, operation: "update")
    }

    var item = query
    attributes.forEach { item[$0.key] = $0.value }
    let addStatus = SecItemAdd(item as CFDictionary, nil)
    guard addStatus == errSecSuccess else {
      throw keychainError(addStatus, operation: "save")
    }
  }

  func remove(service: String, key: String) throws {
    let status = SecItemDelete(baseQuery(service: service, key: key) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw keychainError(status, operation: "remove")
    }
  }

  private func baseQuery(service: String, key: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
  }

  private func keychainError(_ status: OSStatus, operation: String) -> RuntimeError {
    let detail = SecCopyErrorMessageString(status, nil) as String? ?? "OSStatus \(status)"
    return RuntimeError(
      "Secure storage could not \(operation) a music-service credential. Unlock your login keychain, restart Legend Music, and try again. \(detail)"
    )
  }
}
