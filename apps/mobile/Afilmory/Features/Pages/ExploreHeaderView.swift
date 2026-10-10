import UIKit

@MainActor
final class ExploreHeaderView: UIView, UISearchBarDelegate {
  let sectionRail = ExploreSectionRailView()
  var onSearchTextChange: ((String?) -> Void)?

  private let searchBar = UISearchBar()
  private var widthConstraint: NSLayoutConstraint!
  private var heightConstraint: NSLayoutConstraint!
  private var isSearching = false
  private var availableSearchWidth: CGFloat = 220

  override init(frame: CGRect) {
    super.init(frame: frame)
    translatesAutoresizingMaskIntoConstraints = false

    searchBar.delegate = self
    searchBar.searchBarStyle = .minimal
    searchBar.placeholder = String(localized: "Search galleries")
    searchBar.autocapitalizationType = .none
    searchBar.autocorrectionType = .no
    searchBar.spellCheckingType = .no
    searchBar.returnKeyType = .search
    searchBar.enablesReturnKeyAutomatically = true
    searchBar.accessibilityIdentifier = "explore.discover.search"
    searchBar.alpha = 0
    searchBar.isHidden = true

    addSubview(sectionRail)
    addSubview(searchBar)

    let size = sectionRail.intrinsicContentSize
    widthConstraint = widthAnchor.constraint(equalToConstant: size.width)
    heightConstraint = heightAnchor.constraint(equalToConstant: ExploreSectionRailView.railHeight)
    NSLayoutConstraint.activate([widthConstraint, heightConstraint])
    bounds.size = size
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func setAvailableSearchWidth(_ width: CGFloat) {
    let clamped = max(width, 160)
    guard abs(clamped - availableSearchWidth) >= 0.5 else { return }
    availableSearchWidth = clamped
    if isSearching {
      applySize()
    }
  }

  func resignSearchFirstResponder() {
    searchBar.resignFirstResponder()
  }

  func setSearching(_ searching: Bool, animated: Bool) {
    guard searching != isSearching else {
      if searching {
        searchBar.becomeFirstResponder()
      }
      return
    }
    isSearching = searching
    if searching {
      searchBar.isHidden = false
    } else {
      sectionRail.isHidden = false
      searchBar.text = nil
      searchBar.resignFirstResponder()
    }
    applySize()
    let updates = {
      self.sectionRail.alpha = searching ? 0 : 1
      self.searchBar.alpha = searching ? 1 : 0
    }
    let finish = {
      self.sectionRail.isHidden = searching
      self.searchBar.isHidden = !searching
      if searching {
        self.searchBar.becomeFirstResponder()
      }
    }
    if animated {
      UIView.animate(withDuration: 0.28, delay: 0, options: [.curveEaseInOut, .beginFromCurrentState]) {
        updates()
      } completion: { _ in
        finish()
      }
    } else {
      updates()
      finish()
    }
  }

  func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
    onSearchTextChange?(searchText)
  }

  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    searchBar.resignFirstResponder()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sectionRail.frame = bounds
    searchBar.frame = bounds
  }

  override var intrinsicContentSize: CGSize { targetSize }

  private var targetSize: CGSize {
    if isSearching {
      return CGSize(width: availableSearchWidth, height: ExploreSectionRailView.railHeight)
    }
    return sectionRail.intrinsicContentSize
  }

  private func applySize() {
    let size = targetSize
    widthConstraint.constant = size.width
    heightConstraint.constant = size.height
    bounds.size = size
    invalidateIntrinsicContentSize()
  }
}
