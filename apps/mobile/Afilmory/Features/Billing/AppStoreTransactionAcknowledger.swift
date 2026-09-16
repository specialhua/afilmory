import Foundation

protocol AppStoreAcknowledgementPort: Sendable {
  func acknowledge(signedTransactionInfo: String) async throws -> AppStoreTransactionAcknowledgement
  func finish(transactionId: String) async throws -> Bool
}

enum AppStoreAcknowledgementError: Error, Equatable {
  case transactionMismatch
}

// Finishing forfeits the transaction — StoreKit stops replaying it — so it must happen only after
// the server has recorded this exact transaction id. A purchase finished without a server record
// can no longer be restored.
actor AppStoreTransactionAcknowledger {
  private let port: AppStoreAcknowledgementPort
  private var inFlight: [String: Task<AppStoreTransactionAcknowledgement, Error>] = [:]

  init(port: AppStoreAcknowledgementPort) {
    self.port = port
  }

  func acknowledge(
    transactionId: String,
    signedTransactionInfo: String
  ) async throws -> AppStoreTransactionAcknowledgement {
    if let existing = inFlight[transactionId] {
      return try await existing.value
    }

    let task = Task { [port] in
      let acknowledgement = try await port.acknowledge(signedTransactionInfo: signedTransactionInfo)
      guard acknowledgement.transactionId == transactionId else {
        throw AppStoreAcknowledgementError.transactionMismatch
      }
      _ = try await port.finish(transactionId: transactionId)
      return acknowledgement
    }
    inFlight[transactionId] = task
    defer { inFlight[transactionId] = nil }
    return try await task.value
  }
}
