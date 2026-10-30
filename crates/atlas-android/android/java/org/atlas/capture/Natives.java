package org.atlas.capture;

/** The app's native screens: its own (CORE, always there: the notepad, docs/refactor/REFACTOR-notepad-into-core.md)
 *  before the built-in plugins' (NativePlugins, generated from their plugin.toml). */
final class Natives {
    private Natives() {}
    static final NativePlugin[] CORE = { new org.atlas.notepad.Notepad() };

    static boolean core(String id) { for (NativePlugin p : CORE) if (p.id().equals(id)) return true; return false; }

    static NativePlugin byId(String id) {
        for (NativePlugin p : CORE) if (p.id().equals(id)) return p;
        return NativePlugins.byId(id);
    }

    /** The first screen other than `self` that opens `path` (its `#page=N` aside): what a screen hands a file over to
     *  (the notepad a PDF, to the reader whose `[android] opens` covers it), never naming that plugin. */
    static NativePlugin other(String self, String path) {
        int hash = path.indexOf('#');
        String file = hash > 0 ? path.substring(0, hash) : path;
        for (NativePlugin p : CORE) if (!p.id().equals(self) && p.opens(file)) return p;
        for (NativePlugin p : NativePlugins.ALL) if (!p.id().equals(self) && p.opens(file)) return p;
        return null;
    }

    /** The first screen that opens `path`: the app's own, then a plugin's that `running` lets through. */
    static NativePlugin forPath(String path, java.util.function.Predicate<String> running) {
        for (NativePlugin p : CORE) if (p.opens(path)) return p;
        for (NativePlugin p : NativePlugins.ALL) if (p.opens(path) && running.test(p.id())) return p;
        return null;
    }
}
