package org.atlas.capture;

/** Which of the phone's notification channels a notice of the core goes to (Notices.show): one channel per kind, so
 *  each kind can be silenced in Android's own settings without the others. The one place the core's notice sources
 *  (a plugin's id, or the core's own "sync") are mapped onto kinds; plain Java, tested on the JVM (android/test). */
enum NoticeKind {
    // importance: NotificationManager.IMPORTANCE_HIGH = 4 (sound, heads-up), _DEFAULT = 3 (sound), _LOW = 2 (silent)
    REMINDERS("reminders", "Reminders", "A calendar event's reminders, at their time", 4),
    NUDGES("nudges", "Nudges", "Plan's nudges for a task when it fits your day, and its morning digest", 3),
    MAIL("mail", "Mail", "New mail and what the mail plugin has to say", 3),
    SYNC("sync", "Sync", "Conflict copies, a mirror or Syncthing needing a look", 2),
    OTHER("other", "Other", "Everything else: plugins, scheduled commands, failures", 3);

    /** Android's channel id (kept stable: a person's choices for a channel live under its id). */
    final String channel;
    final String title, description;
    final int importance;

    NoticeKind(String id, String title, String description, int importance) {
        this.channel = "kind." + id;
        this.title = title;
        this.description = description;
        this.importance = importance;
    }

    /** The kind of a notice by its source: the plugin that raised it (its folder's name), or the core's "sync". */
    static NoticeKind of(String source) {
        if (source == null) return OTHER;
        switch (source) {
            case "dav": case "calendar": return REMINDERS;
            case "plan": return NUDGES;
            case "email": case "mail": return MAIL;
            case "sync": case "syncthing": case "mirror": return SYNC;
            default: return OTHER;
        }
    }

    /** The channels of the older builds, one per source (`notice.<source>`): removed once the kinds' exist. */
    static boolean oldChannel(String id) { return id != null && id.startsWith("notice."); }
}
