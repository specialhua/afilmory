import Foundation

enum APIBaseURL {
  case platform
  case tenant
  case explicit(String)
}

enum APIMethod: String {
  case delete = "DELETE"
  case get = "GET"
  case patch = "PATCH"
  case post = "POST"
  case put = "PUT"
}

enum APIRetryPolicy: Equatable {
  case none
  case transientGET(maxAttempts: Int, delay: TimeInterval)
}

struct APIEndpoint {
  let baseURL: APIBaseURL
  let path: String
  let method: APIMethod
  let queryItems: [URLQueryItem]
  let body: Data?
  let retryPolicy: APIRetryPolicy

  init(
    baseURL: APIBaseURL,
    path: String,
    method: APIMethod = .get,
    queryItems: [URLQueryItem] = [],
    body: Data? = nil,
    retryPolicy: APIRetryPolicy = .none
  ) {
    precondition(
      method == .get || retryPolicy == .none,
      "Only GET endpoints may opt into automatic retries."
    )
    self.baseURL = baseURL
    self.path = path
    self.method = method
    self.queryItems = queryItems
    self.body = body
    self.retryPolicy = retryPolicy
  }

  static func jsonBody<Value: Encodable>(_ value: Value) throws -> Data {
    try JSONEncoder().encode(value)
  }
}
