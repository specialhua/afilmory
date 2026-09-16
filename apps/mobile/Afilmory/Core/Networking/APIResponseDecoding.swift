import Foundation

enum APIResponseDecoding {
  static func decode<Response: Decodable>(_ type: Response.Type, from data: Data) throws -> Response {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return try decoder.decode(type, from: data)
  }

  static func keyMap(for canonicalKeys: [String]) -> [String: String] {
    Dictionary(uniqueKeysWithValues: canonicalKeys.map { ($0.responseFingerprint, $0) })
  }

  static func canonicalKey(_ key: String, using keyMap: [String: String]) -> String {
    keyMap[key.responseFingerprint] ?? key
  }
}

private extension String {
  var responseFingerprint: String {
    filter { $0.isLetter || $0.isNumber }.lowercased()
  }
}
