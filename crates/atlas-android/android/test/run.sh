#!/usr/bin/env bash
# The phone app's plain-Java logic tested on the desktop JVM (no device, no android.jar): the screen recognisers
# (Onscreen), a page's text selected (PdfText) through the page's space (PageSpace: its box and /Rotate) and a share's pieces made one text (Shares), when a reader writes where you are (ReadingPlace), a server vault's file kept on the phone (ServerCopy), the media player's timeline and reports (PlayerTimeline, PlayerReports), the notifications' channels, the reminders' alarms and the note view's failures (NoticeKind, Reminders, WebHealth), the native Files, Search and Agenda lists' sections, breadcrumbs, hits, typing, days and spans (PlaceItem, FileRows, SearchRows, AgendaRows), the Library's libraries, things and apps (LibraryRows) and who is where above the vault's top (WhereRows), the manga plugin's Suwayomi cache (Kept) and its reader's gestures, zoom and chapter transitions (Gestures, Zoom, Transition) and its library's tabs and Continue (Shelf) and Browse (the server's sources, a source's pages, add to the library: Browse, Json) and when reading makes a series yours (Thing), a book's highlights in its note (Highlights) and its audiobook's chapters matched to the text's (AudioChapters, on the web reader's cases), the PDF reader's page on screen (PageFit) and its page strip (StripLayout); links, the samples codec, shares and properties are the core's (src/text.rs, tested there). Run by build-apk.sh before the APK is made; alone: bash android/test/run.sh
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
src=$here/../java/org/atlas/capture
plugins=$here/../../../../plugins
out=$(mktemp -d); trap 'rm -rf "$out"' EXIT
javac -nowarn --release 17 -d "$out" "$src/Onscreen.java" "$src/Core.java" "$src/PdfText.java" "$src/PageSpace.java" "$src/Shares.java" "$src/ReadingPlace.java" "$src/ServerCopy.java" "$src/PlayerTimeline.java" "$src/PlayerReports.java" "$src/NoticeKind.java" "$src/Reminders.java" "$src/WebHealth.java" "$src/PlaceItem.java" "$src/FileRows.java" "$src/SearchRows.java" "$src/AgendaRows.java" "$src/LibraryRows.java" "$src/WhereRows.java" "$plugins/beta/manga/android/Kept.java" "$plugins/beta/manga/android/Gestures.java" "$plugins/beta/manga/android/Zoom.java" "$plugins/beta/manga/android/Transition.java" "$plugins/beta/manga/android/Shelf.java" "$plugins/beta/manga/android/Browse.java" "$plugins/beta/manga/android/Thing.java" "$src/Json.java" "$plugins/beta/audiobookshelf/android/Cards.java" "$plugins/beta/audiobookshelf/android/Book.java" "$plugins/beta/audiobookshelf/android/Clock.java" "$plugins/beta/audiobookshelf/android/State.java" "$plugins/beta/books/android/Highlights.java" "$plugins/beta/books/android/AudioChapters.java" "$plugins/beta/books/android/PageFit.java" "$plugins/beta/books/android/StripLayout.java" "$here"/org/atlas/capture/*Test.java "$here"/org/atlas/plugins/manga/*Test.java "$here"/org/atlas/plugins/books/*Test.java "$here"/org/atlas/plugins/audiobookshelf/*Test.java
java -cp "$out" org.atlas.capture.OnscreenTest
java -cp "$out" org.atlas.capture.PdfTextTest
java -cp "$out" org.atlas.capture.SharesTest
java -cp "$out" org.atlas.capture.ReadingPlaceTest
java -cp "$out" org.atlas.capture.ServerCopyTest
java -cp "$out" org.atlas.capture.PlayerTest
java -cp "$out" org.atlas.capture.RemindersTest
java -cp "$out" org.atlas.capture.FileRowsTest
java -cp "$out" org.atlas.capture.SearchRowsTest
java -cp "$out" org.atlas.capture.AgendaRowsTest
java -cp "$out" org.atlas.capture.WhereRowsTest
java -cp "$out" org.atlas.capture.LibraryRowsTest
java -cp "$out" org.atlas.plugins.manga.KeptTest
java -cp "$out" org.atlas.plugins.manga.GesturesTest
java -cp "$out" org.atlas.plugins.manga.ShelfTest
java -cp "$out" org.atlas.plugins.manga.BrowseTest
java -cp "$out" org.atlas.plugins.manga.ThingTest
java -cp "$out" org.atlas.plugins.books.HighlightsTest
java -cp "$out" org.atlas.plugins.books.AudioChaptersTest "$here/../../../../ui/tests/fixtures/audiobook-chapters.json"
java -cp "$out" org.atlas.plugins.books.PageFitTest
java -cp "$out" org.atlas.plugins.audiobookshelf.CardsTest
java -cp "$out" org.atlas.plugins.audiobookshelf.BookTest
java -cp "$out" org.atlas.plugins.books.StripLayoutTest
