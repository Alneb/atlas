package org.atlas.capture;

import android.service.notification.NotificationListenerService;

/**
 * Exists only so Android shows the app its media sessions (Playing): notification access is granted to a listener
 * service. It reads no notification; it ignores every one posted.
 */
public final class MediaListener extends NotificationListenerService {}
