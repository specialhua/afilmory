import Foundation
import ImageIO
import UIKit

enum ShareThumbnailGenerator {
  static func write(sourceURL: URL, destinationURL: URL) {
    guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil) else { return }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 512,
    ]
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
          let data = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.78)
    else { return }
    try? data.write(to: destinationURL, options: .atomic)
  }
}
