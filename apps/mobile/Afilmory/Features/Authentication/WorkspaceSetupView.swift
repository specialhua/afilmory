import SwiftUI

struct WorkspaceSetupView: View {
  @FocusState private var focusedField: Field?
  @State private var busy = false
  @State private var error: String?
  @State private var name = ""
  @State private var slug = ""
  @State private var slugEdited = false
  @State private var slugFieldVisible = false
  @State private var step = Step.name
  @State private var workspaceName = ""
  @State private var customDomain = ""
  @State private var pendingSessionCookie: String?
  @State private var pendingTenantSlug: String?
  @State private var pendingDomain: String?
  @State private var quotaReason: QuotaWallReason?
  @State private var showingQuotaWall = false
  @State private var boundDomain: String?
  @State private var boundCnameTarget: String?
  @State private var showingCnameInstructions = false

  let mode: WorkspaceSetupMode

  private enum Field {
    case name
    case slug
    case workspaceName
    case customDomain
  }

  private enum Step {
    case name
    case review
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        switch mode {
        case .create:
          switch step {
          case .name:
            nameContent
          case .review:
            reviewContent
          }
        case .waiting(let workspaceName, let workspaceSlug):
          waitingContent(name: workspaceName, slug: workspaceSlug)
        }
      }
      .navigationTitle(navigationTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        toolbarContent
      }
      .sheet(isPresented: $showingQuotaWall, onDismiss: finishOnboarding) {
        if let quotaReason {
          QuotaWallSheet(reason: quotaReason)
        }
      }
      .sheet(isPresented: $showingCnameInstructions, onDismiss: finishOnboarding) {
        if let boundDomain, let boundCnameTarget {
          WorkspaceCnameInstructionView(domain: boundDomain, cnameTarget: boundCnameTarget)
        }
      }
      .task {
        if case .create = mode {
          applyAccountDefaultsIfNeeded()
          focusedField = .name
        }
      }
    }
  }

  private var navigationTitle: String {
    switch mode {
    case .create:
      switch step {
      case .name:
        String(localized: "Your name")
      case .review:
        String(localized: "New workspace")
      }
    case .waiting:
      String(localized: "Workspace setup")
    }
  }

  private var nameContent: some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 8) {
        Text("What should we call you?")
          .font(.system(size: 24, weight: .bold))
        Text("This becomes the public name of your first gallery. You can edit it now.")
          .font(.system(size: 15))
          .foregroundStyle(.secondary)
          .lineSpacing(3)
      }

      VStack(alignment: .leading, spacing: 7) {
        Text("Name")
          .font(.system(size: 13, weight: .semibold))
        TextField(String(localized: "Ada"), text: $name)
          .submitLabel(slugFieldVisible ? .next : .continue)
          .focused($focusedField, equals: .name)
          .onChange(of: name) { _, value in
            if !slugEdited {
              slug = WorkspaceOnboardingDefaults.normalizeSlug(value)
            }
          }
          .onSubmit {
            if slugFieldVisible {
              focusedField = .slug
            } else {
              continueFromName()
            }
          }
          .afilmoryWorkspaceField()
      }

      if slugFieldVisible {
        slugField(submit: continueFromName)
      }

      if let error {
        Text(error)
          .font(.system(size: 13))
          .foregroundStyle(.red)
          .accessibilityAddTraits(.isStaticText)
      }
    }
    .padding(24)
    .padding(.bottom, 16)
  }

  private var reviewContent: some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 8) {
        Text("Create your gallery workspace")
          .font(.system(size: 24, weight: .bold))
        Text("Confirm the public name, URL identifier, and an optional custom domain.")
          .font(.system(size: 15))
          .foregroundStyle(.secondary)
          .lineSpacing(3)
      }

      VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 7) {
          Text("Workspace name")
            .font(.system(size: 13, weight: .semibold))
          TextField(String(localized: "My photography"), text: $workspaceName)
            .submitLabel(.next)
            .focused($focusedField, equals: .workspaceName)
            .onSubmit { focusedField = .slug }
            .afilmoryWorkspaceField()
        }
        slugField(submit: { focusedField = .customDomain })
        customDomainField
      }

      if let error {
        Text(error)
          .font(.system(size: 13))
          .foregroundStyle(.red)
          .accessibilityAddTraits(.isStaticText)
      }
    }
    .padding(24)
    .padding(.bottom, 16)
  }

  private func slugField(submit: @escaping () -> Void) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      Text("URL identifier")
        .font(.system(size: 13, weight: .semibold))
      TextField("my-gallery", text: $slug)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.done)
        .focused($focusedField, equals: .slug)
        .onChange(of: slug) { _, value in
          let normalized = WorkspaceOnboardingDefaults.normalizeSlug(value)
          slugEdited = true
          if normalized != value { slug = normalized }
        }
        .onSubmit(submit)
        .afilmoryWorkspaceField()
      Text("Lowercase letters, numbers, and hyphens only. At least three characters.")
        .font(.system(size: 12))
        .foregroundStyle(.tertiary)
    }
  }

  private var customDomainField: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text("Custom domain")
        .font(.system(size: 13, weight: .semibold))
      TextField("photos.example.com", text: $customDomain)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.URL)
        .submitLabel(.done)
        .focused($focusedField, equals: .customDomain)
        .accessibilityIdentifier("onboarding.customDomain")
        .onSubmit(submit)
        .afilmoryWorkspaceField()
      Text("Optional. Custom domains are included with Pro.")
        .font(.system(size: 12))
        .foregroundStyle(.tertiary)
    }
  }

  private func waitingContent(name: String, slug: String) -> some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 8) {
        Text("Your workspace is still being set up")
          .font(.system(size: 24, weight: .bold))
        Text("“\(name)” is not ready yet. Sign out and come back later, or continue from another device.")
          .font(.system(size: 15))
          .foregroundStyle(.secondary)
          .lineSpacing(3)
      }

      VStack(alignment: .leading, spacing: 6) {
        Text(name)
          .font(.system(size: 17, weight: .semibold))
        Text(slug)
          .font(.system(size: 14, design: .monospaced))
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(18)
      .background(Color(uiColor: .secondarySystemBackground))
      .clipShape(.rect(cornerRadius: 16, style: .continuous))

    }
    .padding(24)
    .padding(.bottom, 16)
  }

  @ToolbarContentBuilder
  private var toolbarContent: some ToolbarContent {
    switch mode {
    case .create:
      switch step {
      case .name:
        ToolbarItem(placement: .cancellationAction) {
          toolbarIcon("rectangle.portrait.and.arrow.right", title: String(localized: "Sign out"), action: signOut)
            .disabled(busy)
        }
        ToolbarItem(placement: .confirmationAction) {
          if busy {
            ProgressView()
          } else {
            toolbarIcon("chevron.forward", title: String(localized: "Continue"), action: continueFromName)
          }
        }
      case .review:
        ToolbarItem(placement: .cancellationAction) {
          toolbarIcon("chevron.backward", title: String(localized: "Back")) {
            step = .name
            error = nil
            focusedField = .name
          }
          .disabled(busy)
        }
        ToolbarItem(placement: .confirmationAction) {
          if busy {
            ProgressView()
          } else {
            toolbarIcon("checkmark", title: String(localized: "Create"), action: submit)
          }
        }
      }
    case .waiting:
      ToolbarItem(placement: .cancellationAction) {
        toolbarIcon("rectangle.portrait.and.arrow.right", title: String(localized: "Sign out"), action: signOut)
      }
    }
  }

  private func toolbarIcon(_ systemImage: String, title: String, action: @escaping () -> Void) -> some View {
    Button(title, systemImage: systemImage, action: action)
      .labelStyle(.iconOnly)
  }

  private func signOut() {
    Task { @MainActor in
      await NativeAuthenticationService.shared.signOut()
    }
  }

  private func continueFromName() {
    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedName.isEmpty else {
      error = String(localized: "Enter your name to continue.")
      return
    }
    let requestedSlug = WorkspaceOnboardingDefaults.normalizeSlug(slugEdited ? slug : trimmedName)
    if requestedSlug.count < WorkspaceSlugResolver.minimumLength {
      slugFieldVisible = true
      error = String(localized: "Choose a URL identifier of at least three characters.")
      focusedField = .slug
      return
    }
    guard !busy else { return }
    busy = true
    error = nil
    Task { @MainActor in
      defer { busy = false }
      do {
        let resolved: String?
        if slugEdited, slugFieldVisible {
          switch try await NativeAuthenticationService.shared.checkWorkspaceSlug(requestedSlug) {
          case .available(let slug):
            resolved = slug
          case .unavailable(let message):
            slugFieldVisible = true
            error = message
            focusedField = .slug
            return
          }
        } else {
          resolved = try await NativeAuthenticationService.shared.resolveAvailableWorkspaceSlug(from: trimmedName)
        }
        guard let resolved else {
          slugFieldVisible = true
          slug = requestedSlug
          slugEdited = true
          error = String(localized: "That URL identifier is reserved or already in use. Enter a different one.")
          focusedField = .slug
          return
        }
        name = trimmedName
        workspaceName = WorkspaceOnboardingDefaults.siteName(from: trimmedName)
        slug = resolved
        step = .review
        focusedField = .workspaceName
      } catch {
        self.error = String(localized: "The URL identifier could not be checked. Please try again.")
      }
    }
  }

  private func submit() {
    let siteDefaults = WorkspaceOnboardingDefaults.make(
      name: name,
      email: AfilmorySessionStore.shared.current().state.session?.user.email ?? ""
    )
    let normalizedName = workspaceName.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedSlug = WorkspaceOnboardingDefaults.normalizeSlug(slug)
    let domainInput = WorkspaceCustomDomain.normalize(customDomain)
    guard !normalizedName.isEmpty, normalizedSlug.count >= WorkspaceSlugResolver.minimumLength else {
      error = String(localized: "Enter a name and a URL identifier of at least three characters.")
      return
    }
    if !domainInput.isEmpty, !WorkspaceCustomDomain.isValid(customDomain) {
      error = String(localized: "Enter a valid domain such as photos.example.com.")
      focusedField = .customDomain
      return
    }
    guard !busy else { return }
    busy = true
    error = nil
    Task { @MainActor in
      defer { busy = false }
      do {
        switch try await NativeAuthenticationService.shared.checkWorkspaceSlug(normalizedSlug) {
        case .available:
          break
        case .unavailable(let message):
          self.error = message
          return
        }
        let created = try await NativeAuthenticationService.shared.submitWorkspaceCreation(
          name: normalizedName,
          slug: normalizedSlug,
          settings: siteDefaults.siteSettings(for: normalizedName)
        )
        pendingSessionCookie = created.cookie
        pendingTenantSlug = created.slug
        pendingDomain = domainInput.isEmpty ? nil : domainInput
        if domainInput.isEmpty {
          try await NativeAuthenticationService.shared.activateWorkspaceSession(cookie: created.cookie)
          return
        }
        guard let tenantSlug = created.slug else {
          quotaReason = .customDomain(current: 0, limit: 0)
          showingQuotaWall = true
          return
        }
        switch try await NativeAuthenticationService.shared.requestCustomDomain(
          domainInput,
          cookie: created.cookie,
          tenantSlug: tenantSlug
        ) {
        case .bound(let domain, let cnameTarget):
          pendingDomain = nil
          boundDomain = domain
          boundCnameTarget = cnameTarget
          showingCnameInstructions = true
        case .needsUpgrade(let reason):
          quotaReason = reason
          showingQuotaWall = true
        }
      } catch {
        if let cookie = pendingSessionCookie {
          try? await NativeAuthenticationService.shared.activateWorkspaceSession(cookie: cookie)
        } else {
          self.error = String(localized: "The workspace could not be created. The identifier may already be in use.")
        }
      }
    }
  }

  private func finishOnboarding() {
    guard let cookie = pendingSessionCookie else { return }
    let domain = pendingDomain
    let tenantSlug = pendingTenantSlug
    pendingSessionCookie = nil
    pendingTenantSlug = nil
    pendingDomain = nil
    Task { @MainActor in
      if let domain, let tenantSlug {
        _ = try? await NativeAuthenticationService.shared.requestCustomDomain(
          domain,
          cookie: cookie,
          tenantSlug: tenantSlug
        )
      }
      try? await NativeAuthenticationService.shared.activateWorkspaceSession(cookie: cookie)
    }
  }

  private var accountDefaults: WorkspaceOnboardingDefaults {
    AfilmorySessionStore.shared.current().state.session?.workspaceOnboardingDefaults
      ?? WorkspaceOnboardingDefaults.make(name: "", email: "")
  }

  private func applyAccountDefaultsIfNeeded() {
    guard name.isEmpty, slug.isEmpty else { return }
    let defaults = accountDefaults
    name = defaults.displayName
    slug = defaults.slug
  }
}

private struct WorkspaceCnameInstructionView: View {
  @Environment(\.dismiss) private var dismiss

  let domain: String
  let cnameTarget: String

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 8) {
          Text("Point your domain at Afilmory")
            .font(.system(size: 22, weight: .bold))
          Text("Add this CNAME record at your DNS provider. HTTPS is provisioned after the record resolves.")
            .font(.system(size: 15))
            .foregroundStyle(.secondary)
            .lineSpacing(3)
        }

        VStack(alignment: .leading, spacing: 12) {
          cnameRow(title: String(localized: "Host"), value: domain)
          cnameRow(title: String(localized: "CNAME"), value: cnameTarget)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground))
        .clipShape(.rect(cornerRadius: 16, style: .continuous))

        Spacer()
      }
      .padding(24)
      .navigationTitle(String(localized: "Custom domain"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(String(localized: "Done"), action: dismiss.callAsFunction)
        }
      }
    }
    .presentationDetents([.medium])
  }

  private func cnameRow(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.system(size: 13, weight: .semibold))
      Text(value)
        .font(.system(size: 15, design: .monospaced))
        .textSelection(.enabled)
    }
  }
}

private extension View {
  func afilmoryWorkspaceField() -> some View {
    padding(.horizontal, 14)
      .frame(height: 48)
      .background(Color(uiColor: .secondarySystemBackground))
      .clipShape(.rect(cornerRadius: 12, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(Color(uiColor: .separator), lineWidth: 0.5)
      }
  }
}
