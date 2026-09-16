import SwiftUI
import UIKit

final class ShareViewController: UIViewController {
  private lazy var model = ShareUploadModel(
    onCancel: { [weak self] in self?.cancelRequest() },
    onComplete: { [weak self] in self?.completeRequest() }
  )

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let host = UIHostingController(rootView: ShareUploadView(model: model))
    addChild(host)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(host.view)
    NSLayoutConstraint.activate([
      host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      host.view.topAnchor.constraint(equalTo: view.topAnchor),
      host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    host.didMove(toParent: self)

    let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
    model.load(inputItems: items)
  }

  private func cancelRequest() {
    let error = NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError)
    extensionContext?.cancelRequest(withError: error)
  }

  private func completeRequest() {
    extensionContext?.completeRequest(returningItems: nil)
  }
}
