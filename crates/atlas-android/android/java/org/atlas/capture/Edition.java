package org.atlas.capture;

import android.content.Context;

/** Which of the three apps this is, from its package (one Java, one Rust library, three manifests — build-apk.sh):
 *  the capture app, the full app, and the full app for Boox e-ink tablets, which is always in e-ink mode and carries the pen and reading features. */
enum Edition {
    CAPTURE, ATLAS, BOOX;

    static Edition of(Context c) {
        switch (c.getPackageName()) {
            case "org.atlas.app": return ATLAS;
            case "org.atlas.boox": return BOOX;
            default: return CAPTURE;
        }
    }

    /** The full app (Today, Files, notes, the in-app server), not only the capture box. */
    boolean full() { return this != CAPTURE; }
}
