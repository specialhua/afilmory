import UIKit

final class PhotoDetailReactionBurstLayer: UIView {
  private static let maxParticles = 12
  private static let travel: CGFloat = 128
  private static let driftRange: ClosedRange<CGFloat> = -30 ... 30
  private static let fontRange: ClosedRange<CGFloat> = 17 ... 27
  private static let duration: CFTimeInterval = 1.5

  private var particles: [UILabel] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = .clear
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func emit(_ reaction: String, from origin: CGPoint) {
    if particles.count >= Self.maxParticles {
      recycleOldest()
    }

    let label = UILabel()
    label.text = reaction
    label.font = .systemFont(ofSize: .random(in: Self.fontRange))
    label.sizeToFit()
    label.center = origin
    label.layer.opacity = 0
    addSubview(label)
    particles.append(label)

    let drift = CGFloat.random(in: Self.driftRange)
    let destination = CGPoint(x: origin.x + drift, y: origin.y - Self.travel)
    let path = UIBezierPath()
    path.move(to: origin)
    path.addQuadCurve(
      to: destination,
      controlPoint: CGPoint(x: origin.x - drift * 0.6, y: origin.y - Self.travel * 0.55)
    )

    let position = CAKeyframeAnimation(keyPath: "position")
    position.path = path.cgPath
    position.calculationMode = .paced

    let scale = CAKeyframeAnimation(keyPath: "transform.scale")
    scale.values = [0.5, 1.18, 1.0, 0.6]
    scale.keyTimes = [0, 0.08, 0.3, 1]

    let opacity = CAKeyframeAnimation(keyPath: "opacity")
    opacity.values = [0, 1, 0.95, 0]
    opacity.keyTimes = [0, 0.08, 0.6, 1]

    let group = CAAnimationGroup()
    group.animations = [position, scale, opacity]
    group.duration = Self.duration
    group.timingFunction = CAMediaTimingFunction(name: .easeOut)
    group.fillMode = .forwards
    group.isRemovedOnCompletion = false

    CATransaction.begin()
    CATransaction.setCompletionBlock { [weak self, weak label] in
      guard let self, let label else { return }
      remove(label)
    }
    label.layer.add(group, forKey: "burst")
    CATransaction.commit()
  }

  func clear() {
    particles.forEach { $0.removeFromSuperview() }
    particles.removeAll()
  }

  private func recycleOldest() {
    guard let oldest = particles.first else { return }
    remove(oldest)
  }

  private func remove(_ label: UILabel) {
    label.layer.removeAllAnimations()
    label.removeFromSuperview()
    particles.removeAll { $0 === label }
  }
}
