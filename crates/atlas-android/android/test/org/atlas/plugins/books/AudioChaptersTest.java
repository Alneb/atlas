package org.atlas.plugins.books;

import org.atlas.capture.Json;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** The reader's audiobook (AudioChapters): the audiobook a note names and chapters matched by title, on the cases the
 *  web reader's rules are tested on too (args[0]: ui/tests/fixtures/audiobook-chapters.json; android/test/run.sh). */
public final class AudioChaptersTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (String.valueOf(want).equals(String.valueOf(got))) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    @SuppressWarnings("unchecked")
    public static void main(String[] a) throws Exception {
        Object cases = Json.parse(new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8));
        for (Object c : Json.arr(cases, "item")) {
            Map<String, Object> props = Json.obj(c, "props");
            eq("item of " + props, Json.str(c, "want", null), AudioChapters.itemOf(Json.str(props, "audiobookshelf", null), Json.str(props, "audiobook", null)));
        }
        for (Object c : Json.arr(cases, "norm")) {
            List<Object> pair = (List<Object>) c;
            eq("norm " + pair.get(0), pair.get(1), AudioChapters.norm((String) pair.get(0)));
        }
        for (Object c : Json.arr(cases, "match")) {
            List<String> titles = new ArrayList<>();
            for (Object t : Json.arr(c, "titles")) titles.add((String) t);
            eq("match " + Json.str(c, "title", "") + " in " + titles, Json.num(c, "want", -9), AudioChapters.match(titles, Json.str(c, "title", "")));
        }
        eq("cases read", true, ran > 20);
        System.out.println("AudioChaptersTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
