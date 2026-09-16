import Foundation

enum APIError: Error {
  case unauthorized
  case http(status: Int, body: String?)
  case transport(Error)
  case decoding(Error)
  case cancelled

  static func response(status: Int, body: Data?) -> APIError? {
    guard !(200..<300).contains(status) else { return nil }
    if status == 401 {
      return .unauthorized
    }
    let text = body.flatMap { String(data: $0, encoding: .utf8) }
    return .http(status: status, body: text?.isEmpty == false ? text : nil)
  }

  static func request(_ error: Error) -> APIError {
    if error is CancellationError || (error as? URLError)?.code == .cancelled {
      return .cancelled
    }
    if let error = error as? APIError {
      return error
    }
    return .transport(error)
  }
}

extension APIError {
  fileprivate static func serverMessage(from body: String?) -> String? {
    guard let body, let data = body.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let message = object["message"] as? String
    else { return nil }
    let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

extension APIError: LocalizedError {
  var errorDescription: String? {
    switch self {
    case .unauthorized:
      "Authentication is required."
    case .http(let status, let body):
      Self.serverMessage(from: body) ?? body ?? "The server returned HTTP \(status)."
    case .transport(let error), .decoding(let error):
      error.localizedDescription
    case .cancelled:
      "The request was cancelled."
    }
  }
}
