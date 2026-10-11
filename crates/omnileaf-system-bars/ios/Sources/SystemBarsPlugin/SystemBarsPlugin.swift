import Foundation
@preconcurrency import Tauri
import UIKit
import WebKit
import os

private let logger = Logger(subsystem: "app.omnileaf", category: "system-bars")
private let rememberedStyleKey = "app.omnileaf.interface-style"

enum InterfaceStyle: String, Decodable {
  case unspecified
  case light
  case dark

  var userInterfaceStyle: UIUserInterfaceStyle {
    switch self {
    case .unspecified: .unspecified
    case .light: .light
    case .dark: .dark
    }
  }

  static var remembered: InterfaceStyle {
    UserDefaults.standard.string(forKey: rememberedStyleKey).flatMap(InterfaceStyle.init)
      ?? .unspecified
  }

  func remember() {
    UserDefaults.standard.set(rawValue, forKey: rememberedStyleKey)
  }
}

struct ShowStyleArgs: Decodable {
  let style: InterfaceStyle
}

enum ShowStyleError: LocalizedError {
  case noScreen

  var errorDescription: String? {
    "there is no screen yet"
  }
}

final class SystemBarsPlugin: Plugin {
  @objc public override func load(webview: WKWebView) {
    let root = manager.viewController
    let style = InterfaceStyle.remembered
    MainActor.assumeIsolated {
      do {
        try show(style, in: root)
      } catch {
        logger.error("show the remembered style: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  @objc public func showStyle(_ invoke: Invoke) {
    let style: InterfaceStyle
    do {
      style = try invoke.parseArgs(ShowStyleArgs.self).style
    } catch {
      reject(invoke, error)
      return
    }
    style.remember()
    let manager = self.manager
    DispatchQueue.main.async {
      do {
        try show(style, in: manager.viewController)
        invoke.resolve()
      } catch {
        reject(invoke, error)
      }
    }
  }
}

private func reject(_ invoke: Invoke, _ error: Error) {
  logger.error("show the window's style: \(error.localizedDescription, privacy: .public)")
  invoke.reject(error.localizedDescription)
}

/// Styles the whole window, so the screens it presents follow too, then restyles the status bar, which takes the root view controller's style.
@MainActor
private func show(_ style: InterfaceStyle, in root: UIViewController?) throws {
  guard let root, let window = root.view.window else {
    throw ShowStyleError.noScreen
  }
  window.overrideUserInterfaceStyle = style.userInterfaceStyle
  root.setNeedsStatusBarAppearanceUpdate()
}

@_cdecl("init_plugin_system_bars")
func initPlugin() -> Plugin {
  return SystemBarsPlugin()
}
