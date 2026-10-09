import FolderBookmarks
import Foundation
@preconcurrency import Tauri
import UIKit
import UniformTypeIdentifiers
import os

private let logger = Logger(subsystem: "app.omnileaf", category: "folder-access")

struct ReopenArgs: Decodable {
  let bookmark: [UInt8]
}

struct PickedFolder: Encodable {
  let path: String
  let bookmark: [UInt8]
}

struct ReopenedFolder: Encodable {
  let path: String
  let refreshed: [UInt8]?
}

final class FolderAccessPlugin: Plugin {
  private let bookmarks = FolderBookmarks()

  @objc public func pickFolder(_ invoke: Invoke) {
    let bookmarks = self.bookmarks
    let manager = self.manager
    DispatchQueue.main.async {
      guard let presenter = manager.viewController else {
        invoke.reject("There's no screen to show the folder picker on.")
        return
      }
      let isShown = FolderPicker.show(from: presenter) { picked in
        guard let picked else {
          invoke.resolve()
          return
        }
        DispatchQueue.global(qos: .userInitiated).async {
          do {
            let folder = try bookmarks.bookmark(for: picked)
            invoke.resolve(PickedFolder(path: folder.path, bookmark: Array(folder.bookmark)))
          } catch {
            logger.error(
              "bookmark a picked folder: \(error.localizedDescription, privacy: .public)")
            invoke.reject(error.localizedDescription)
          }
        }
      }
      if !isShown {
        invoke.reject("The folder picker is already open.")
      }
    }
  }

  @objc public func restoreAccess(_ invoke: Invoke) {
    do {
      let args = try invoke.parseArgs(ReopenArgs.self)
      let folder = try bookmarks.resolve(Data(args.bookmark))
      invoke.resolve(
        ReopenedFolder(path: folder.path, refreshed: folder.refreshedBookmark.map { Array($0) }))
    } catch {
      logger.error("reopen a bookmarked folder: \(error.localizedDescription, privacy: .public)")
      invoke.reject(error.localizedDescription)
    }
  }
}

/// Shows one folder picker at a time, full screen so it can't be swiped away without an answer.
@MainActor
final class FolderPicker: NSObject, UIDocumentPickerDelegate {
  private static var shown: FolderPicker?
  private let finish: (URL?) -> Void

  private init(finish: @escaping (URL?) -> Void) {
    self.finish = finish
  }

  static func show(from root: UIViewController, finish: @escaping (URL?) -> Void) -> Bool {
    guard shown == nil else {
      return false
    }
    var presenter = root
    while let presented = presenter.presentedViewController {
      presenter = presented
    }
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
    picker.allowsMultipleSelection = false
    picker.modalPresentationStyle = .fullScreen
    let delegate = FolderPicker(finish: finish)
    picker.delegate = delegate
    shown = delegate
    presenter.present(picker, animated: true)
    return true
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL])
  {
    end(with: urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    end(with: nil)
  }

  private func end(with picked: URL?) {
    Self.shown = nil
    finish(picked)
  }
}

@_cdecl("init_plugin_folder_access")
func initPlugin() -> Plugin {
  return FolderAccessPlugin()
}
