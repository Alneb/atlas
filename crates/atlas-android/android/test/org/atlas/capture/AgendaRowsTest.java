package org.atlas.capture;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** The Agenda's rules (AgendaRows): a span's days and title, which items fall on a day and in what order, the rows'
 *  words, the widget's next items (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class AgendaRowsTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    private static AgendaRows.Item ev(String title, String start, String end, boolean allDay) {
        return AgendaRows.Item.event(title, start, end, allDay);
    }

    public static void main(String[] a) {
        java.util.Locale.setDefault(java.util.Locale.US); // the names below are English (AgendaRows reads the locale)
        LocalDate today = LocalDate.of(2026, 11, 17); // a Tuesday
        // spans: a day, three days from the day, the week the day is in (from the locale's first day)
        eq("a day is the day", today, AgendaRows.first(AgendaRows.Span.DAY, today, DayOfWeek.MONDAY));
        eq("a week starts on its first day", LocalDate.of(2026, 11, 16), AgendaRows.first(AgendaRows.Span.WEEK, today, DayOfWeek.MONDAY));
        eq("… or on Sunday", LocalDate.of(2026, 11, 15), AgendaRows.first(AgendaRows.Span.WEEK, today, DayOfWeek.SUNDAY));
        eq("three days end two days on", LocalDate.of(2026, 11, 19), AgendaRows.last(AgendaRows.Span.THREE, today));
        eq("a step moves by the span", LocalDate.of(2026, 11, 20), AgendaRows.step(AgendaRows.Span.THREE, today, 1));
        eq("a week back", LocalDate.of(2026, 11, 10), AgendaRows.step(AgendaRows.Span.WEEK, today, -1));
        eq("an unknown kept span: three days", AgendaRows.Span.THREE, AgendaRows.Span.of("MONTH"));
        eq("the day's title", "Tomorrow", AgendaRows.title(AgendaRows.Span.DAY, today.plusDays(1), today));
        eq("three days in one month", "17 – 19 Nov", AgendaRows.title(AgendaRows.Span.THREE, today, today));
        eq("a week over two months", "30 Nov – 6 Dec", AgendaRows.title(AgendaRows.Span.WEEK, LocalDate.of(2026, 11, 30), today));
        eq("next year's says it", "28 Dec – 3 Jan 2027", AgendaRows.title(AgendaRows.Span.WEEK, LocalDate.of(2026, 12, 28), today));

        // the items as the core gives them: times on the wall clock with their offset, all-day ends exclusive
        AgendaRows.Item meeting = ev("Group meeting", "2026-11-17T10:00:00-05:00", "2026-11-17T11:30:00-05:00", false);
        meeting.location = "Room 4";
        meeting.calendar = "Personal";
        AgendaRows.Item open = ev("Open day", "2026-11-18", "2026-11-19", true);
        AgendaRows.Item night = ev("Night shift", "2026-11-17T22:00:00+01:00", "2026-11-18T06:00:00+01:00", false);
        AgendaRows.Item toMidnight = ev("Party", "2026-11-18T20:00:00Z", "2026-11-19T00:00:00Z", false);
        AgendaRows.Item task = AgendaRows.Item.due("Send the draft", "2026-11-18", "notes/thesis.md", 3, false);
        AgendaRows.Item note = AgendaRows.Item.due("Grant", "2026-11-18", "grants/Grant.md", 0, true);
        List<AgendaRows.Item> all = new ArrayList<>(Arrays.asList(toMidnight, task, night, meeting, note, open));

        eq("today: the meeting, then the night shift", "[EVENT Group meeting 2026-11-17T10:00:00-05:00, EVENT Night shift 2026-11-17T22:00:00+01:00]",
            AgendaRows.onDay(all, today).toString());
        eq("tomorrow: all-day events, then tasks and notes, then the timed ones", "[Open day, Grant, Send the draft, Night shift, Party]",
            titles(AgendaRows.onDay(all, today.plusDays(1))));
        eq("an event ending at midnight is not on the next day", "[]", titles(AgendaRows.onDay(Arrays.asList(toMidnight), today.plusDays(2))));
        eq("an all-day event's end is the day after", false, AgendaRows.on(open, today.plusDays(2)));
        eq("a timed event's hours", "10:00 – 11:30", AgendaRows.when(meeting, today, false));
        eq("on a 12-hour clock", "10:00 AM – 11:30 AM", AgendaRows.when(meeting, today, true).replace(' ', ' ').toUpperCase());
        eq("it goes on past the day", "22:00 – …", AgendaRows.when(night, today, false));
        eq("it began the day before", "… – 06:00", AgendaRows.when(night, today.plusDays(1), false));
        eq("it ends at midnight", "20:00 – 00:00", AgendaRows.when(toMidnight, today.plusDays(1), false));
        eq("an all-day event", "All day", AgendaRows.when(open, today.plusDays(1), false));

        List<PlaceItem> rows = AgendaRows.rows(all, today, today.plusDays(2), today, false, FileRowsTest.SHOWN);
        eq("a header per day, its items, an empty day said",
            "[# Today · Tue 17 Nov | 2 items, - Group meeting | 10:00 – 11:30 · Room 4 · Personal, - Night shift | 22:00 – …, "
                + "# Tomorrow · Wed 18 Nov | 5 items, - Open day | All day, - Grant | Due · Grant @grants/Grant.md, - Send the draft | Task · thesis @notes/thesis.md:3, - Night shift | … – 06:00, - Party | 20:00 – 00:00, "
                + "# Thu 19 Nov, - Nothing planned]",
            rows.toString());
        eq("a task's row stands for its item", task, rows.get(6).ref);
        eq("a task's icon", "check", rows.get(6).icon);
        eq("an event's icon", "calendar", rows.get(1).icon);
        eq("the empty day's row opens nothing", true, rows.get(rows.size() - 1).ref == null && rows.get(rows.size() - 1).path == null);

        // the widget: what is not over yet, the soonest first
        LocalDateTime now = LocalDateTime.of(2026, 11, 17, 12, 0);
        List<AgendaRows.Item> next = AgendaRows.next(all, now, 4);
        eq("the meeting is over; the night shift next, then tomorrow's", "[Night shift, Open day, Grant, Send the draft]", titles(next));
        eq("a line for today", "Today 22:00 Night shift", AgendaRows.nextLine(night, today, false));
        eq("a line for an all-day thing", "Tomorrow · Send the draft", AgendaRows.nextLine(task, today, false));

        System.out.println("AgendaRowsTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }

    private static String titles(List<AgendaRows.Item> items) {
        List<String> t = new ArrayList<>();
        for (AgendaRows.Item i : items) t.add(i.title);
        return t.toString();
    }
}
