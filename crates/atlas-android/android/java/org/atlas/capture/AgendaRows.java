package org.atlas.capture;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/**
 * The phone's Agenda as plain data (no Android: AgendaRowsTest, android/test/run.sh): the days a span shows, its title,
 * which items fall on a day and in what order, each row's words, and the next items the home-screen widget lists. The
 * items are the core's answers as they come — the Calendar engine's `range` (events, times on the user's wall clock)
 * and the core's `from: deadlines` view (dated tasks and notes) — the same two the desktop's Agenda reads
 * (plugins/stable/dav/ui/src/api.ts `agendaRange`); nothing here decides what is due.
 */
final class AgendaRows {
    private AgendaRows() {}

    /** How much the Agenda shows: a day, three days from the day, or the week the day is in. */
    enum Span {
        DAY(1, "Day"), THREE(3, "3 days"), WEEK(7, "Week");
        final int days;
        final String label;
        Span(int days, String label) { this.days = days; this.label = label; }
        /** A kept name back (an unknown one: three days). */
        static Span of(String name) {
            for (Span s : values()) if (s.name().equals(name)) return s;
            return THREE;
        }
    }

    /** The first day shown for `cursor`: the week's first day for a week, else the day itself. */
    static LocalDate first(Span s, LocalDate cursor, DayOfWeek weekStart) {
        return s == Span.WEEK ? cursor.with(TemporalAdjusters.previousOrSame(weekStart)) : cursor;
    }

    static LocalDate last(Span s, LocalDate first) { return first.plusDays(s.days - 1); }

    /** The cursor one step (← →) on. */
    static LocalDate step(Span s, LocalDate cursor, int by) { return cursor.plusDays((long) s.days * by); }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.getDefault());
    private static final DateTimeFormatter DAY_YEAR = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.getDefault());

    /** A day as the list names it: Today, Tomorrow, Yesterday, else "Wed 18 Nov" (the year when not this one's). */
    static String dayName(LocalDate d, LocalDate today) {
        if (d.equals(today)) return "Today";
        if (d.equals(today.plusDays(1))) return "Tomorrow";
        if (d.equals(today.minusDays(1))) return "Yesterday";
        return d.format(d.getYear() == today.getYear() ? DAY : DAY_YEAR);
    }

    /** The bar's title: the day's name, or "17 – 19 Nov", "30 Nov – 6 Dec", the year when not this one's. */
    static String title(Span s, LocalDate first, LocalDate today) {
        if (s == Span.DAY) return dayName(first, today);
        LocalDate last = last(s, first);
        String year = last.getYear() == today.getYear() ? "" : " " + last.getYear();
        String a = first.getMonth() == last.getMonth() ? String.valueOf(first.getDayOfMonth()) : first.format(DateTimeFormatter.ofPattern("d MMM", Locale.getDefault()));
        return a + " – " + last.format(DateTimeFormatter.ofPattern("d MMM", Locale.getDefault())) + year;
    }

    /** One thing of the agenda: an event of the Calendar engine, or a dated task or note of the core's deadlines. */
    static final class Item {
        enum Kind { EVENT, TASK, NOTE }
        final Kind kind;
        final String title;
        /** EVENT: its start and end as the engine says them (`2026-11-04T10:00:00-05:00`, or a day; an all-day end is
         *  the day after); TASK, NOTE: its day twice. */
        final String start, end;
        final boolean allDay;
        /** EVENT: where, its calendar's name, the note it came from (or ""); TASK, NOTE: "". */
        String location = "", calendar = "", source = "";
        /** TASK, NOTE: its file and (TASK) its line, 1-based. */
        String path;
        int line;

        private Item(Kind kind, String title, String start, String end, boolean allDay) {
            this.kind = kind; this.title = title; this.start = start; this.end = end; this.allDay = allDay;
        }

        static Item event(String title, String start, String end, boolean allDay) { return new Item(Kind.EVENT, title, start, end, allDay); }

        /** A row of `from: deadlines`: a task (with a line) or a note with `due:` (`from` = "note"). */
        static Item due(String title, String date, String path, int line, boolean note) {
            Item i = new Item(note ? Kind.NOTE : Kind.TASK, title, date, date, true);
            i.path = path;
            i.line = line;
            return i;
        }

        boolean task() { return kind != Kind.EVENT; }

        @Override public String toString() { return kind + " " + title + " " + start; }
    }

    /** An engine time on the user's wall clock: a day at midnight, an instant as its local date and time. */
    static LocalDateTime at(String s) {
        if (s.length() == 10) return LocalDate.parse(s).atStartOfDay();
        try { return OffsetDateTime.parse(s).toLocalDateTime(); }
        catch (RuntimeException e) { return LocalDateTime.parse(s.length() > 19 ? s.substring(0, 19) : s); }
    }

    private static LocalDateTime end(Item i) {
        // a task's or note's day is all of it; an all-day event's end is already the day after
        return i.task() ? at(i.start).plusDays(1) : at(i.end);
    }

    /** Whether `i` is on day `d`: an event that overlaps it (an event ending at midnight is not on the next day), a
     *  task or note dated that day. */
    static boolean on(Item i, LocalDate d) {
        LocalDateTime from = d.atStartOfDay(), to = from.plusDays(1);
        LocalDateTime s = at(i.start), e = end(i);
        if (!e.isAfter(s)) e = s.plusMinutes(1); // an event of no length still shows at its time
        return s.isBefore(to) && e.isAfter(from);
    }

    /** All-day things first (events, then tasks and notes), then the timed ones by start, then by title. */
    private static final Comparator<Item> ORDER = Comparator
        .comparingInt((Item i) -> i.allDay ? (i.task() ? 1 : 0) : 2)
        .thenComparing(i -> at(i.start))
        .thenComparing(i -> i.title);

    static List<Item> onDay(List<Item> all, LocalDate d) {
        List<Item> out = new ArrayList<>();
        for (Item i : all) if (on(i, d)) out.add(i);
        out.sort(ORDER);
        return out;
    }

    private static String clock(LocalTime t, boolean h12) {
        return t.format(DateTimeFormatter.ofPattern(h12 ? "h:mm a" : "HH:mm", Locale.getDefault()));
    }

    /** When an item is on day `d`: "All day", "10:00 – 11:30", "… – 11:30" (began before), "22:00 – …" (ends after). */
    static String when(Item i, LocalDate d, boolean h12) {
        if (i.allDay) return i.task() ? (i.kind == Item.Kind.NOTE ? "Due" : "Task") : "All day";
        LocalDateTime s = at(i.start), e = at(i.end), from = d.atStartOfDay(), to = from.plusDays(1);
        String a = s.isBefore(from) ? "…" : clock(s.toLocalTime(), h12);
        String b = e.isAfter(to) ? "…" : e.equals(to) ? clock(LocalTime.MIDNIGHT, h12) : clock(e.toLocalTime(), h12);
        if (s.isBefore(from) && e.isAfter(to)) return "All day";
        return a + " – " + b;
    }

    /** The list: a header per day of [from, to] (Today, Tomorrow, a date; how many things), its items as rows — an
     *  event: its time, place and calendar under its title; a task or note: what it is and its note's name — and an
     *  empty day said ("Nothing planned"). `ref` of each row is its Item; `shown` names a note (Look.shownName). */
    static List<PlaceItem> rows(List<Item> all, LocalDate from, LocalDate to, LocalDate today, boolean h12, Function<String, String> shown) {
        List<PlaceItem> out = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            List<Item> day = onDay(all, d);
            PlaceItem h = PlaceItem.header(d.equals(today) || d.equals(today.plusDays(1)) || d.equals(today.minusDays(1)) ? dayName(d, today) + " · " + d.format(DAY) : dayName(d, today));
            h.detail = day.isEmpty() ? "" : day.size() == 1 ? "1 item" : day.size() + " items";
            out.add(h);
            if (day.isEmpty()) {
                PlaceItem free = PlaceItem.row("Nothing planned");
                free.dim = true;
                out.add(free);
            }
            for (Item i : day) out.add(row(i, d, h12, shown));
        }
        return out;
    }

    private static PlaceItem row(Item i, LocalDate d, boolean h12, Function<String, String> shown) {
        PlaceItem r = PlaceItem.row(i.title.isEmpty() ? "(no title)" : i.title);
        r.ref = i;
        r.more = true;
        List<String> parts = new ArrayList<>();
        parts.add(when(i, d, h12));
        if (i.task()) {
            r.icon = i.kind == Item.Kind.NOTE ? "flag" : "check";
            r.path = i.path;
            r.line = i.line;
            if (i.path != null) parts.add(shown.apply(i.path));
        } else {
            r.icon = "calendar";
            if (!i.location.isEmpty()) parts.add(i.location);
            if (!i.calendar.isEmpty()) parts.add(i.calendar);
        }
        r.detail = String.join(" · ", parts);
        return r;
    }

    /** What the widget lists: the things not over yet from `now` on — events still to end, tasks and notes of today
     *  or later — the soonest first, at most `max`. */
    static List<Item> next(List<Item> all, LocalDateTime now, int max) {
        List<Item> out = new ArrayList<>();
        for (Item i : all) if (end(i).isAfter(now)) out.add(i);
        out.sort(Comparator.comparing((Item i) -> at(i.start)).thenComparingInt(i -> i.allDay ? (i.task() ? 1 : 0) : 2).thenComparing(i -> i.title));
        return out.subList(0, Math.min(max, out.size()));
    }

    /** A widget line: "Today 10:00 Group meeting", "Tomorrow · Send the draft", "Wed 18 Nov · Open day". */
    static String nextLine(Item i, LocalDate today, boolean h12) {
        LocalDateTime s = at(i.start);
        LocalDate d = s.toLocalDate().isBefore(today) ? today : s.toLocalDate(); // begun already: it is on today
        String title = i.title.isEmpty() ? "(no title)" : i.title;
        if (i.allDay || s.toLocalDate().isBefore(today)) return dayName(d, today) + " · " + title;
        return dayName(d, today) + " " + clock(s.toLocalTime(), h12) + " " + title;
    }
}
