import UIKit

// The combo cap is otherwise invisible: the count simply freezes and the haptic
// changes character, which reads as the control breaking. The ring is what says
// how much room is left.
final class PhotoDetailReactionChargeRing: UIView {
  private static let lineWidth: CGFloat = 3

  private let track = CAShapeLayer()
  private let charge = CAShapeLayer()

  init() {
    super.init(frame: .zero)

    alpha = 0
    isUserInteractionEnabled = false

    for shape in [track, charge] {
      shape.fillColor = UIColor.clear.cgColor
      shape.lineCap = .round
      shape.lineWidth = Self.lineWidth
      layer.addSublayer(shape)
    }
    track.strokeColor = UIColor.white.withAlphaComponent(0.18).cgColor
    charge.strokeColor = UIColor.white.cgColor
    charge.strokeEnd = 0
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    let path = UIBezierPath(
      arcCenter: CGPoint(x: bounds.midX, y: bounds.midY),
      radius: (min(bounds.width, bounds.height) - Self.lineWidth) / 2,
      startAngle: -.pi / 2,
      endAngle: 1.5 * .pi,
      clockwise: true
    ).cgPath

    for shape in [track, charge] {
      shape.frame = bounds
      shape.path = path
    }
  }

  func setProgress(_ value: CGFloat, animated: Bool) {
    let clamped = min(max(value, 0), 1)
    guard animated else {
      charge.removeAnimation(forKey: "charge")
      charge.strokeEnd = clamped
      return
    }

    let animation = CABasicAnimation(keyPath: "strokeEnd")
    animation.fromValue = charge.presentation()?.strokeEnd ?? charge.strokeEnd
    animation.toValue = clamped
    animation.duration = 0.18
    animation.timingFunction = CAMediaTimingFunction(name: .linear)
    charge.strokeEnd = clamped
    charge.add(animation, forKey: "charge")
  }
}
