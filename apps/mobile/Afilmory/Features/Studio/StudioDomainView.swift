import SwiftUI
import UIKit

@MainActor
final class StudioDomainViewModel: ObservableObject {
  @Published private(set) var listing: StudioDomainListing?
  @Published var domainInput = ""
  @Published private(set) var loading = false
  @Published private(set) var mutating = false
  @Published private(set) var verifyingID: String?
  @Published private(set) var deletingID: String?
  @Published var error: Error?
  @Published var actionMessage: String?
  @Published var quotaReason: QuotaWallReason?

  var pendingDomain: StudioTenantDomain? {
    listing?.domains.first { $0.status == .pending }
  }

  func load() async {
    if listing == nil { loading = true }
    defer { loading = false }
    do {
      listing = try await NativeStudioAPI.tenantDomains()
      error = nil
    } catch is CancellationError {
      return
    } catch {
      self.error = error
    }
  }

  func add() async {
    guard let listing, !mutating else { return }
    switch StudioDomainPolicy.addDecision(for: domainInput, listing: listing) {
    case .empty:
      actionMessage = String(localized: "Please enter a domain before binding.")
    case .invalid:
      actionMessage = String(localized: "Enter a valid domain such as photos.example.com.")
    case .upgrade(let reason):
      quotaReason = reason
    case .request(let host):
      await mutate {
        _ = try await NativeStudioAPI.requestDomain(host)
        domainInput = ""
      }
    }
  }

  func verify(_ domain: StudioTenantDomain) async {
    guard domain.canVerify, verifyingID == nil else { return }
    verifyingID = domain.id
    defer { verifyingID = nil }
    await mutate {
      _ = try await NativeStudioAPI.verifyDomain(id: domain.id)
    }
  }

  func delete(_ domain: StudioTenantDomain) async {
    guard deletingID == nil else { return }
    deletingID = domain.id
    defer { deletingID = nil }
    await mutate {
      try await NativeStudioAPI.deleteDomain(id: domain.id)
    }
  }

  private func mutate(_ work: () async throws -> Void) async {
    mutating = true
    defer { mutating = false }
    do {
      try await work()
      await load()
    } catch let error as APIError {
      if let reason = QuotaWallReason.parse(apiError: error) {
        quotaReason = reason
      } else {
        actionMessage = error.localizedDescription
      }
    } catch is CancellationError {
      return
    } catch {
      actionMessage = error.localizedDescription
    }
  }
}

struct StudioDomainView: View {
  @StateObject private var model = StudioDomainViewModel()
  @State private var showingPlan = false
  @State private var pendingDeletion: StudioTenantDomain?

  var body: some View {
    Group {
      if model.loading, model.listing == nil {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let error = model.error, model.listing == nil {
        StudioFailureView(error: error) { Task { await model.load() } }
      } else if let listing = model.listing {
        domainForm(listing)
      }
    }
    .task { await model.load() }
    .alert(
      String(localized: "Custom domain"),
      isPresented: Binding(
        get: { model.actionMessage != nil },
        set: { if !$0 { model.actionMessage = nil } }
      )
    ) {
      Button(String(localized: "Done")) { model.actionMessage = nil }
    } message: {
      Text(model.actionMessage ?? "")
    }
    .confirmationDialog(
      String(localized: "Remove this domain?"),
      isPresented: Binding(
        get: { pendingDeletion != nil },
        set: { if !$0 { pendingDeletion = nil } }
      ),
      titleVisibility: .visible
    ) {
      Button(String(localized: "Remove Domain"), role: .destructive) {
        if let pendingDeletion {
          Task { await model.delete(pendingDeletion) }
        }
      }
      Button(String(localized: "Cancel"), role: .cancel) {}
    }
    .sheet(isPresented: $showingPlan) {
      SubscriptionView(focus: .customDomain(current: model.listing?.domains.count ?? 0, limit: 0))
    }
    .sheet(
      isPresented: Binding(
        get: { model.quotaReason != nil },
        set: { if !$0 { model.quotaReason = nil } }
      )
    ) {
      if let reason = model.quotaReason {
        QuotaWallSheet(reason: reason)
      }
    }
  }

  private func domainForm(_ listing: StudioDomainListing) -> some View {
    Form {
      if let pending = model.pendingDomain {
        Section {
          Text("Cloudflare is provisioning \(pending.domain). DNS and certificate activation may take a few minutes.")
            .font(.subheadline)
        }
      }

      Section {
        TextField("photos.yourdomain.com", text: $model.domainInput)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .keyboardType(.URL)
          .submitLabel(.done)
          .onSubmit { Task { await model.add() } }
          .disabled(model.mutating)
        if StudioDomainPolicy.needsUnlock(listing) {
          Button(String(localized: "Unlock with Pro")) { showingPlan = true }
        } else {
          Button(String(localized: "Bind domain")) {
            Task { await model.add() }
          }
          .disabled(model.mutating || model.domainInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      } header: {
        Text("Custom domain")
      } footer: {
        Text("A subdomain is recommended. Apex domains require compatible DNS flattening or Cloudflare Apex Proxying.")
      }

      Section(String(localized: "Verification steps")) {
        labeledStep(
          number: 1,
          title: String(localized: "Point CNAME to Afilmory"),
          detail: String(
            localized: "Create a CNAME record that points your custom hostname to \(cnameTarget(listing))."
          )
        )
        labeledStep(
          number: 2,
          title: String(localized: "Confirm Cloudflare activation"),
          detail: String(
            localized: "After DNS propagates, check the status. The domain becomes active only when both hostname and SSL are active."
          )
        )
      }

      Section(String(localized: "Bound domains")) {
        if listing.domains.isEmpty {
          Text("No custom domains yet. Add one above to start verification.")
            .foregroundStyle(.secondary)
        } else {
          ForEach(listing.domains) { domain in
            domainBlock(domain, cnameTarget: cnameTarget(listing))
          }
        }
      }
    }
    .formStyle(.grouped)
    .scrollDismissesKeyboard(.interactively)
    .refreshable { await model.load() }
  }

  @ViewBuilder
  private func domainBlock(_ domain: StudioTenantDomain, cnameTarget: String) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text(domain.domain)
          .font(.body.weight(.semibold))
          .textSelection(.enabled)
        Spacer()
        Button {
          pendingDeletion = domain
        } label: {
          Image(systemName: "trash")
        }
        .disabled(model.deletingID != nil)
        .accessibilityLabel(String(localized: "Remove Domain"))
        .tint(.red)
      }

      HStack {
        Label(statusTitle(domain.status), systemImage: statusSymbol(domain.status))
          .font(.subheadline)
          .foregroundStyle(statusColor(domain.status))
        Spacer()
        if domain.canVerify {
          Button {
            Task { await model.verify(domain) }
          } label: {
            if model.verifyingID == domain.id {
              ProgressView()
            } else {
              Image(systemName: "arrow.clockwise")
            }
          }
          .disabled(model.verifyingID != nil)
          .accessibilityLabel(String(localized: "Check status"))
        }
      }

      if domain.showsDNSInstructions {
        dnsCard(domain: domain, cnameTarget: cnameTarget)
      }
    }
    .padding(.vertical, 4)
  }

  private func dnsCard(domain: StudioTenantDomain, cnameTarget: String) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("CNAME record")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      copyRow(String(localized: "Type"), "CNAME")
      copyRow(String(localized: "Name / Host"), domain.domain)
      copyRow(String(localized: "Value"), cnameTarget)
      copyRow(String(localized: "TTL"), String(localized: "300s or provider default"))
      Text("Point the custom hostname to this exact SaaS target. Cloudflare will validate ownership and issue the certificate.")
        .font(.caption)
        .foregroundStyle(.secondary)

      copyRow(String(localized: "Hostname"), domain.hostnameStatus ?? "unknown")
      copyRow(String(localized: "SSL"), domain.sslStatus ?? "unknown")

      if !domain.verificationErrors.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          Text("Cloudflare validation")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.red)
          ForEach(domain.verificationErrors, id: \.self) { error in
            Text(error)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(uiColor: .secondarySystemBackground), in: .rect(cornerRadius: 12, style: .continuous))
  }

  private func copyRow(_ label: String, _ value: String) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(width: 92, alignment: .leading)
      Text(value)
        .font(.subheadline.monospaced())
        .textSelection(.enabled)
      Spacer(minLength: 8)
      Button {
        UIPasteboard.general.string = value
      } label: {
        Image(systemName: "doc.on.doc")
      }
      .accessibilityLabel(String(localized: "Copy"))
    }
  }

  private func labeledStep(number: Int, title: String, detail: String) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Text("\(number)")
        .font(.subheadline.weight(.semibold))
        .frame(width: 24, height: 24)
        .background(Color.accentColor, in: Circle())
        .foregroundStyle(.white)
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.subheadline.weight(.semibold))
        Text(detail).font(.subheadline).foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 2)
  }

  private func cnameTarget(_ listing: StudioDomainListing) -> String {
    listing.cnameTarget.isEmpty ? "—" : listing.cnameTarget
  }

  private func statusTitle(_ status: StudioDomainStatus) -> String {
    switch status {
    case .pending: String(localized: "Pending DNS")
    case .verified: String(localized: "Active")
    case .disabled: String(localized: "Disabled")
    }
  }

  private func statusSymbol(_ status: StudioDomainStatus) -> String {
    switch status {
    case .pending: "circle.dashed"
    case .verified: "checkmark.circle"
    case .disabled: "arrow.uturn.backward"
    }
  }

  private func statusColor(_ status: StudioDomainStatus) -> Color {
    switch status {
    case .pending: .orange
    case .verified: .green
    case .disabled: .secondary
    }
  }
}
