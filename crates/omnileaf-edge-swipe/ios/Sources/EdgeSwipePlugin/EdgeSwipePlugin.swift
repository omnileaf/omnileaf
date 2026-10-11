@preconcurrency import Tauri
import UIKit
import WebKit
import os

private let logger = Logger(subsystem: "app.omnileaf", category: "edge-swipe")

/// How far from the edge, in points, a swipe may start, as wide as the system's own swipe back.
private let edgeWidth: CGFloat = 20

enum SwipeEdge: String, Decodable {
  case left
  case right

  /// Turns a movement across the screen into one towards going back, which runs away from this edge.
  func backwards(_ distance: CGFloat) -> CGFloat {
    switch self {
    case .left: distance
    case .right: -distance
    }
  }

  func distance(of point: CGPoint, in bounds: CGRect) -> CGFloat {
    switch self {
    case .left: point.x - bounds.minX
    case .right: bounds.maxX - point.x
    }
  }
}

struct SwipeReport: Encodable {
  enum Kind: String, Encodable {
    case moved
    case released
    case cancelled
  }

  let kind: Kind
  var progress: Double?
  var velocity: Double?
}

struct WatchArgs: Decodable {
  let channel: Channel
}

struct AllowArgs: Decodable {
  let edge: SwipeEdge?
}

final class EdgeSwipePlugin: Plugin {
  private let follower = MainActor.assumeIsolated { SwipeFollower() }

  @objc public override func load(webview: WKWebView) {
    let follower = self.follower
    MainActor.assumeIsolated {
      follower.attach(to: webview)
    }
  }

  @objc public func watch(_ invoke: Invoke) {
    do {
      let channel = try invoke.parseArgs(WatchArgs.self).channel
      let follower = self.follower
      DispatchQueue.main.async {
        follower.channel = channel
      }
      invoke.resolve()
    } catch {
      logger.error("watch swipes from the edge: \(error.localizedDescription, privacy: .public)")
      invoke.reject(error.localizedDescription)
    }
  }

  @objc public func allow(_ invoke: Invoke) {
    do {
      let edge = try invoke.parseArgs(AllowArgs.self).edge
      let follower = self.follower
      DispatchQueue.main.async {
        follower.edge = edge
      }
      invoke.resolve()
    } catch {
      logger.error("allow a swipe from the edge: \(error.localizedDescription, privacy: .public)")
      invoke.reject(error.localizedDescription)
    }
  }
}

/// Reports a pan that starts at the allowed edge as the share of the web view's width it has crossed.
@MainActor
final class SwipeFollower: NSObject, UIGestureRecognizerDelegate {
  var channel: Channel?
  var edge: SwipeEdge?
  private var swipingFrom: SwipeEdge?

  func attach(to webview: WKWebView) {
    let recognizer = UIPanGestureRecognizer(target: self, action: #selector(follow))
    recognizer.delegate = self
    webview.addGestureRecognizer(recognizer)
    webview.scrollView.panGestureRecognizer.require(toFail: recognizer)
  }

  func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
    guard let edge, let pan = recognizer as? UIPanGestureRecognizer, let view = pan.view else {
      return false
    }
    let moved = pan.translation(in: view)
    let now = pan.location(in: view)
    let start = CGPoint(x: now.x - moved.x, y: now.y - moved.y)
    let isFromTheEdge = edge.distance(of: start, in: view.bounds) <= edgeWidth
    let isTowardsBack = edge.backwards(moved.x) > abs(moved.y)
    return isFromTheEdge && isTowardsBack
  }

  @objc private func follow(_ recognizer: UIPanGestureRecognizer) {
    if recognizer.state == .began {
      swipingFrom = edge
    }
    guard let from = swipingFrom, let view = recognizer.view, view.bounds.width > 0 else {
      return
    }
    let width = view.bounds.width
    let progress = Double(from.backwards(recognizer.translation(in: view).x) / width)
    switch recognizer.state {
    case .began, .changed:
      send(SwipeReport(kind: .moved, progress: progress))
    case .ended:
      let velocity = Double(from.backwards(recognizer.velocity(in: view).x) / width)
      send(SwipeReport(kind: .released, progress: progress, velocity: velocity))
      swipingFrom = nil
    case .cancelled, .failed:
      send(SwipeReport(kind: .cancelled))
      swipingFrom = nil
    default:
      break
    }
  }

  private func send(_ report: SwipeReport) {
    do {
      try channel?.send(report)
    } catch {
      logger.error("report a swipe from the edge: \(error.localizedDescription, privacy: .public)")
    }
  }
}

@_cdecl("init_plugin_edge_swipe")
func initPlugin() -> Plugin {
  return EdgeSwipePlugin()
}
