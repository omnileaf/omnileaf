# Changelog

What changed in each Omnileaf release, in plain words.

## 0.1.0 (unreleased)

The first release.

## Security

- **Platform:** A comic archive that holds files named to land outside the archive is read without those files.
- **Notices:** Problem and crash reports swap series and folder names for stand-ins and remove file names, folder paths and quoted text. Anything 18+ is left out, and nothing is sent until you choose.

## New

- **Library:** Add folders of comics and books and Omnileaf reads them where they are. Nothing is copied, moved or changed.
- **Library:** It reads CBZ, CB7 and CBR comics and folders of images, and sorts them into series, volumes, chapters and specials from the folder names, file names and the details inside each file.
- **Library:** Folders are scanned when you add them, and you can rescan any time. While Omnileaf is open it also checks your folders for new books, and on desktop it notices changes right away.
- **Library:** Folders on removable drives and network shares are checked less often, and checks pause while Android battery saver is on. You can turn them off in Settings.
- **Library:** When a folder or its drive is missing, its series show as Not connected and a card explains why. You can find the folder, choose it again or unlink it, and your reading progress is kept.
- **Library:** A folder that looks empty keeps its books until you choose to remove them, in case its drive is unplugged.
- **Library:** Removing a folder takes it out of the library at once with Undo, and its files stay where they are.
- **Library:** Show your library as a grid, compact grid, covers only or a list. Pick how many covers fit in a row, stack the covers of series with many books, and add unread counts, language and progress to covers.
- **Library:** A Continue reading row can sit above your library, and a fast scroller with a letter bubble helps in a long one.
- **Library:** Categories show as tabs, or in the sidebar on a Mac. Make your own, drag them into order, hide the ones you do not use and pick which tab the library opens on.
- **Library:** Put series in categories and add tags to them, with suggestions as you type. Rename or delete tags in Settings.
- **Library:** Group the library by category, folder or creator.
- **Library:** Sort by title, recently added, recently read, last updated, unread count or time left to finish.
- **Library:** Filter by read state, format, language, tags, 18+ and bookmarked. The filters in use show on one line, with Clear all.
- **Library:** Smart filters find Quick reads, series you have Forgotten and Duplicates, which are the same book in more than one folder.
- **Library:** Select several series at once to mark them read, file them in categories, tag them or remove them from the library.
- **Library:** Removing series asks first and offers to also delete their files from disk. Your progress, bookmarks and edits come back if you add them again.
- **Reader:** Read one page or two at a time, left to right or right to left. When the direction is on Automatic, Omnileaf follows what the book says and remembers it for each series.
- **Reader:** Zoom with a pinch, a double tap or the keyboard, and fit pages to the screen, width or height.
- **Reader:** Choose how taps turn pages: edge zones, an L shape or off. Pages can slide with your finger.
- **Reader:** Crop white borders, pick a black, grey or white background, set the light's brightness and warmth, and keep the screen on while you read.
- **Reader:** Long strips such as webtoons scroll down their pages. Omnileaf spots them from the pages, and you can change the choice for a series.
- **Reader:** Auto scroll moves a long strip for you, with Faster and Slower, a pace of your own and Space to pause.
- **Reader:** Drag the page slider to see previews of the pages ahead, or jump to any other book of the series from inside the reader.
- **Reader:** Bookmark a page or a spread, with Undo.
- **Reader:** Omnileaf remembers where you stopped in every book and picks up there. Up next offers the following book, and the end of a series says so.
- **Reader:** It can learn how fast you read on this device and show how long the rest of the chapter takes. Time left also works for sorting and for Quick reads.
- **Reader:** History lists every book you read once, with a summary of your week, search, and remove or clear with Undo.
- **Reader:** A damaged book opens as far as it can be read and says how much works. A page that will not load offers Try again and Next page.
- **Reader:** Press ? to see the keyboard shortcuts. Alt and left arrow, or the mouse's back button, takes you back.
- **Series:** The series page shows its details, a Continue card with the time left, and its books with their pages, bookmarks and new marks.
- **Series:** Volumes, Chapters and Specials get their own tabs. Gaps in the numbers show as missing volumes.
- **Series:** Edit details changes the title, people, summary, tags and 18+ mark. Changes show only in Omnileaf, and files stay as they are. Leave a field empty to use the file's value.
- **Series:** Mark books read or unread, bookmark several books at once and clear their bookmarks.
- **Series:** Delete picked books, with the same choice to also delete their files.
- **Series:** A creator page lists their series in your library, and a series shows the others in your library that share its creator.
- **Search:** Search finds series, books, creators, tags and chapter titles. When nothing matches, it suggests the spelling you likely meant.
- **Search:** Narrow a search with scope chips or typed filters such as unread. Results show why they matched, and recent searches are kept.
- **Search:** Quick open jumps to a book or series, continues reading or runs an action from anywhere in the app.
- **Settings:** Settings has General, Appearance, Library, Reader, Privacy and security, Storage, Advanced and About, and each page says where it stands.
- **Settings:** Pick light, dark or follow the device, choose when the library opens, and set the time format.
- **Settings:** Screenshot mode swaps names and covers for stand-ins, hides 18+ and blanks the reader's pages, so a screenshot shows nothing private. It can turn itself off after a time.
- **Settings:** On desktop, turn Screenshot mode on with a shortcut you choose or from the tray or menu bar. On phones, long-press the app icon for Screenshot mode, Continue reading and Search.
- **Settings:** For 18+ series, choose Show, Blur covers or Hide. A series counts as 18+ from its file's age rating or when you mark it yourself.
- **Settings:** Storage shows the space used and clears cached pages and covers. When space runs low, the oldest cached pages and covers go first.
- **Settings:** Permissions lists what Omnileaf may ask for and opens the system's settings. Advanced has switches for animations and for how long Undo stays.
- **Settings:** About has version details you can copy, the open-source licences and a way to report a problem.
- **First launch:** A short welcome explains that Omnileaf reads what you already have and needs no account.
- **First launch:** Pick where your library lives. If a library is already in that folder, you can use it to bring back your progress, categories and settings.
- **First launch:** Link your folders, or drop them on the window on desktop, then pick light or dark and how 18+ covers show, starting on Blur.
- **First launch:** You're all set opens the library while scanning carries on, and explains any folder that could not be read and how to fix it.
- **Notices:** If Omnileaf closes unexpectedly, it offers a report next time. You see exactly what is included, and a report can be sent, copied or saved.
- **Notices:** Send to Omnileaf needs no account, and an email for a reply is optional. You can also open the report on GitHub, copy it or save it as a file.
- **Notices:** Your reports lists each report you made with its code and says when it is answered or already reported.
- **Notices:** Needs attention gathers missing folders, low space and other things to fix in one place.
- **Notices:** A warning appears when the device is almost out of space, and removals and bookmarks offer Undo.
- **Notices:** If your library cannot open, or was last opened by a newer Omnileaf, a screen says so and nothing is changed.
- **Platform:** Omnileaf runs on Windows, macOS, Linux, Android, iPhone and iPad, and follows the system's text size.
- **Platform:** iPhone follows iOS: a floating tab bar, large titles, grouped lists, action sheets and a swipe from the edge to go back. Folders are linked through the Files app.
- **Platform:** iPad puts the tab bar at the top and opens sort, filter and view options as popovers.
- **Platform:** Android phones follow Material 3: tonal surfaces, top bars that collapse, bottom sheets and colours taken from your wallpaper. The back gesture closes a sheet before it leaves the page.
- **Platform:** On Android, pick folders with Android's folder picker, turn pages with the volume keys, and open or share CBZ and CB7 files straight into Omnileaf.
- **Platform:** macOS has a sidebar, a toolbar, a table for lists, a side panel for sort and filter, Show in Finder and sign-in for network shares.
- **Platform:** Windows follows Windows 11: a Mica window, a navigation pane, command bars, your accent colour and Show in File Explorer.
- **Platform:** Linux picks folders through the desktop portal and lets you select covers by dragging a box or with Ctrl, Shift and Space.
- **Platform:** On desktop, open a comic from your file manager or drop files on the window. Choose to read them now, add them to the library or copy them into the home folder.
- **Platform:** On desktop, change the home folder in Settings and Omnileaf moves your library there on the next start.

## Faster

- **Library:** Categories, crowded tags and smart filters load quickly even in a large library.
- **Reader:** The reader is ready before you tap a book, so it opens sooner.
- **Series:** A series' list of unread books and the covers in the library load faster.

## Fixed

- **Library:** The library refreshes after you choose a missing folder again.
- **Library:** Category tabs are no longer cut off after scrolling, reordering or resizing the window.
- **Library:** Covers are drawn fewer and wider at large text sizes, and the number of covers no longer flashes while you change it.
- **Reader:** A file type Omnileaf cannot read is refused with a clear screen before any reading is tried.
- **Reader:** The opened-outside-library notice stays below the status bar.
- **Platform:** On Android, Back closes an open sheet or dialog first, and the back preview works on Android 16.
- **Platform:** Accented file names inside RAR archives are read correctly on Apple devices.
- **Platform:** On iPhone and iPad, Settings names the right place in Files where your library lives.

Contributors: @kaiserbh
