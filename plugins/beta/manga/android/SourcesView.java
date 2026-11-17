package org.atlas.plugins.manga;

import android.content.Context;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import org.atlas.capture.Host;
import org.atlas.capture.Look;
import org.atlas.capture.TopBar;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;

/**
 * Browse (Mihon's Browse → Sources): the sources installed in the user's Suwayomi, under their languages (the phone's
 * first, Browse.rows), a box that narrows them by name, pull to list them again. A tap opens the source's series
 * (SourceView). Installing or updating a source (an extension) stays in Suwayomi's own web page. Nothing is kept: with
 * the server out of reach there is nothing to browse, and the screen says so.
 */
final class SourcesView extends LinearLayout implements org.atlas.capture.NativePlugin.Back {
    private final MangaScreen screen;
    private final Host host;
    private final Look look;
    private final Covers covers;
    private final ExecutorService io = Pages.pool(1, "manga-sources");
    private final EditText filter;
    private final ListView list;
    private final TextView status;
    private final Adapter adapter = new Adapter();
    private List<Browse.Source> sources = new ArrayList<>();
    private List<Object> rows = new ArrayList<>();
    private boolean loaded;
    /** Why the sources could not be listed (null: they were). */
    private String failure;

    SourcesView(MangaScreen screen) {
        super(screen.getContext());
        this.screen = screen;
        this.host = screen.host;
        this.look = host.look();
        covers = new Covers(host);
        Context c = getContext();
        setOrientation(VERTICAL);
        setBackgroundColor(look.bg);

        TopBar bar = new TopBar(host, () -> host.activity().onBackPressed());
        bar.title("Browse");
        bar.sub(Suwayomi.base(host).replaceFirst("^https?://", "") + "'s sources");
        addView(bar, new LayoutParams(-1, -2));

        filter = new EditText(c);
        filter.setHint("Find a source");
        filter.setSingleLine(true);
        filter.setTextColor(look.text);
        filter.setHintTextColor(look.faint);
        filter.setBackground(look.round(look.hover, 10, look.border));
        filter.setPadding(look.dp(14), look.dp(10), look.dp(14), look.dp(10));
        filter.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int d) {}
            public void onTextChanged(CharSequence s, int a, int b, int d) {}
            public void afterTextChanged(Editable e) { fill(); }
        });
        LayoutParams fp = new LayoutParams(-1, -2);
        fp.setMargins(look.dp(12), look.dp(8), look.dp(12), look.dp(4));
        addView(filter, fp);

        list = new ListView(c);
        list.setDivider(null);
        list.setSelector(new android.graphics.drawable.ColorDrawable(0));
        list.setClipToPadding(false);
        list.setPadding(look.dp(4), 0, look.dp(4), look.dp(24));
        list.setAdapter(adapter);
        list.setOnItemClickListener((p, v, i, id) -> { Object r = rows.get(i); if (r instanceof Browse.Source) screen.source((Browse.Source) r); });
        FrameLayout body = new FrameLayout(c);
        body.addView(new Pull(host, list, this::load), new FrameLayout.LayoutParams(-1, -1));
        status = look.label(c, "Listing the sources…", 15, look.muted);
        status.setGravity(Gravity.CENTER);
        status.setPadding(look.dp(32), 0, look.dp(32), 0);
        body.addView(status, new FrameLayout.LayoutParams(-1, -1));
        addView(body, new LayoutParams(-1, 0, 1));
        load(null);
    }

    private void load(Runnable done) {
        Pages.run(io, () -> {
            List<Browse.Source> got = null;
            String why = null;
            try { got = Suwayomi.sources(host); } catch (Exception e) { why = e.getMessage() == null ? e.toString() : e.getMessage(); }
            final List<Browse.Source> got2 = got;
            final String why2 = why;
            post(() -> {
                loaded = true;
                failure = why2;
                if (got2 != null) sources = got2;
                else if (!sources.isEmpty()) host.toast(why2);
                fill();
                if (done != null) done.run();
            });
        });
    }

    private void fill() {
        rows = Browse.rows(sources, filter.getText().toString(), Locale.getDefault().getLanguage());
        adapter.notifyDataSetChanged();
        boolean empty = rows.isEmpty();
        status.setText(!loaded ? "Listing the sources…"
            : !sources.isEmpty() ? "No source matches."
            : failure != null ? "The sources could not be listed: " + failure + "\n(pull to try again)"
            : "This server has no sources: install them in Suwayomi's Extensions (its own web page).");
        status.setVisibility(empty ? VISIBLE : GONE);
        if (host.eink()) post(host::einkRefresh);
    }

    @Override public boolean back() { return false; }

    @Override protected void onDetachedFromWindow() { io.shutdownNow(); covers.close(); super.onDetachedFromWindow(); }

    private final class Adapter extends BaseAdapter {
        @Override public int getCount() { return rows.size(); }
        @Override public Object getItem(int i) { return rows.get(i); }
        @Override public long getItemId(int i) { return i; }
        @Override public int getViewTypeCount() { return 2; }
        @Override public int getItemViewType(int i) { return rows.get(i) instanceof String ? 0 : 1; }
        @Override public boolean isEnabled(int i) { return !(rows.get(i) instanceof String); }

        @Override public View getView(int i, View old, ViewGroup parent) {
            Object r = rows.get(i);
            if (r instanceof String) return look.heading(getContext(), (String) r);
            Browse.Source s = (Browse.Source) r;
            SourceRow row = old instanceof SourceRow ? (SourceRow) old : new SourceRow(getContext());
            row.name.setText(s.displayName.replaceFirst("\\s*\\([^)]*\\)$", "")); // the language is the heading's
            List<String> bits = new ArrayList<>();
            bits.add(s.latest ? "popular · latest" : "popular");
            if (s.nsfw) bits.add("18+");
            row.detail.setText(String.join(" · ", bits));
            row.setContentDescription(s.displayName);
            covers.show(row.icon, "icon:" + s.id, covers.icon(s));
            return row;
        }
    }

    /** A source: its icon, its name, what it lists. */
    private final class SourceRow extends LinearLayout {
        final ImageView icon;
        final TextView name, detail;

        SourceRow(Context c) {
            super(c);
            setGravity(Gravity.CENTER_VERTICAL);
            setMinimumHeight(look.dp(56));
            setPadding(look.dp(12), look.dp(6), look.dp(12), look.dp(6));
            setBackground(look.pressable(0, 8, 0));
            icon = new ImageView(c);
            icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
            icon.setBackground(look.round(look.hover, 8, 0));
            icon.setClipToOutline(true);
            addView(icon, new LayoutParams(look.dp(36), look.dp(36)));
            LinearLayout names = new LinearLayout(c);
            names.setOrientation(VERTICAL);
            names.setPadding(look.dp(14), 0, 0, 0);
            name = look.label(c, "", 15.5f, look.text);
            name.setSingleLine(true);
            name.setEllipsize(TextUtils.TruncateAt.END);
            detail = look.label(c, "", 12.5f, look.faint);
            detail.setSingleLine(true);
            names.addView(name);
            names.addView(detail);
            addView(names, new LayoutParams(0, -2, 1));
        }
    }
}
