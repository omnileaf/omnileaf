import Foundation
import ObjectiveC
@preconcurrency import Tauri
import UIKit
import WebKit
import os

private let logger = Logger(subsystem: "app.omnileaf", category: "icon-actions")

enum IconAction: String, Codable {
  case screenshotMode
  case continueReading
  case searchLibrary

  var symbolName: String {
    switch self {
    case .screenshotMode: "eye"
    case .continueReading: "play"
    case .searchLibrary: "magnifyingglass"
    }
  }
}

struct IconShortcut: Decodable {
  let action: IconAction
  let title: String
  let state: String?

  @MainActor
  var quickAction: UIApplicationShortcutItem {
    UIApplicationShortcutItem(
      type: action.rawValue,
      localizedTitle: title,
      localizedSubtitle: state,
      icon: UIApplicationShortcutIcon(systemImageName: action.symbolName),
      userInfo: nil)
  }
}

struct ShowArgs: Decodable {
  let shortcuts: [IconShortcut]
}

struct WatchArgs: Decodable {
  let channel: Channel
}

final class IconActionsPlugin: Plugin {
  @objc public func show(_ invoke: Invoke) {
    do {
      let shortcuts = try invoke.parseArgs(ShowArgs.self).shortcuts
      DispatchQueue.main.async {
        UIApplication.shared.shortcutItems = shortcuts.map { $0.quickAction }
        invoke.resolve()
      }
    } catch {
      logger.error("show the icon's quick actions: \(error.localizedDescription, privacy: .public)")
      invoke.reject(error.localizedDescription)
    }
  }

  @objc public func watch(_ invoke: Invoke) {
    do {
      let channel = try invoke.parseArgs(WatchArgs.self).channel
      DispatchQueue.main.async {
        ChosenActions.shared.watch(with: channel)
      }
      invoke.resolve()
    } catch {
      logger.error("watch the icon's quick actions: \(error.localizedDescription, privacy: .public)")
      invoke.reject(error.localizedDescription)
    }
  }
}

@MainActor
final class ChosenActions {
  static let shared = ChosenActions()

  private var channel: Channel?
  private var pending: IconAction?

  func choose(_ type: String) {
    guard let action = IconAction(rawValue: type) else {
      logger.error("follow a quick action the app does not have: \(type, privacy: .public)")
      return
    }
    guard let channel else {
      pending = action
      return
    }
    send(action, to: channel)
  }

  func watch(with channel: Channel) {
    self.channel = channel
    guard let pending else {
      return
    }
    self.pending = nil
    send(pending, to: channel)
  }

  private func send(_ action: IconAction, to channel: Channel) {
    do {
      try channel.send(action)
    } catch {
      logger.error("pass on a quick action: \(error.localizedDescription, privacy: .public)")
    }
  }
}

/// Tao's application and scene delegates have no quick action methods, so UIKit drops a chosen quick action unless they are added.
enum QuickActionDelivery {
  private typealias PerformAction =
    @convention(block) (
      AnyObject, AnyObject, UIApplicationShortcutItem, @escaping @convention(block) (Bool) -> Void
    ) -> Void
  private typealias ConnectScene =
    @convention(c) (AnyObject, Selector, UIScene, UISceneSession, UIScene.ConnectionOptions) -> Void
  private typealias ConnectingScene =
    @convention(block) (AnyObject, UIScene, UISceneSession, UIScene.ConnectionOptions) -> Void

  private static let performActionTypes = "v@:@@@?"
  private static let applicationDelegate = "AppDelegate"
  private static let sceneDelegate = "TaoSceneDelegate"
  private static let applicationPerformAction =
    "application:performActionForShortcutItem:completionHandler:"
  private static let scenePerformAction =
    "windowScene:performActionForShortcutItem:completionHandler:"
  private static let sceneWillConnect = "scene:willConnectToSession:options:"

  static func install() {
    addPerformAction(applicationPerformAction, to: applicationDelegate)
    addPerformAction(scenePerformAction, to: sceneDelegate)
    takeLaunchingAction(from: sceneDelegate)
  }

  private static func addPerformAction(_ selectorName: String, to className: String) {
    guard let delegate = NSClassFromString(className) else {
      logger.error("find \(className, privacy: .public) to give it quick actions")
      return
    }
    let perform: PerformAction = { _, _, item, completion in
      nonisolated(unsafe) let chosen = item
      deliver(MainActor.assumeIsolated { chosen.type })
      completion(true)
    }
    let isAdded = class_addMethod(
      delegate, NSSelectorFromString(selectorName), imp_implementationWithBlock(perform),
      performActionTypes)
    if !isAdded {
      logger.notice("\(className, privacy: .public) already answers \(selectorName, privacy: .public)")
    }
  }

  /// On the scene lifecycle UIKit hands the quick action that launched the app only to the scene's connection options.
  private static func takeLaunchingAction(from className: String) {
    let willConnect = NSSelectorFromString(sceneWillConnect)
    guard let delegate = NSClassFromString(className),
      let method = class_getInstanceMethod(delegate, willConnect)
    else {
      logger.error("find \(className, privacy: .public) to take the launching quick action")
      return
    }
    let connect = unsafeBitCast(method_getImplementation(method), to: ConnectScene.self)
    let connecting: ConnectingScene = { sceneDelegate, scene, session, options in
      connect(sceneDelegate, willConnect, scene, session, options)
      nonisolated(unsafe) let connection = options
      if let type = MainActor.assumeIsolated({ connection.shortcutItem?.type }) {
        deliver(type)
      }
    }
    method_setImplementation(method, imp_implementationWithBlock(connecting))
  }

  private static func deliver(_ type: String) {
    MainActor.assumeIsolated {
      ChosenActions.shared.choose(type)
    }
  }
}

@_cdecl("init_plugin_icon_actions")
func initPlugin() -> Plugin {
  QuickActionDelivery.install()
  return IconActionsPlugin()
}
