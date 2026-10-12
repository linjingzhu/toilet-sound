package app.veil.audio;

import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/** Validate the whole command before changing any player. No URL/path input is accepted. */
final class MixRequest {
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,63}");
    private static final Pattern FILE = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,95}\\.(wav|mp3|m4a|aac)");
    static final int MAX_TRACKS = 16;

    static final class Entry {
        final String id;
        final String file;
        final float gain;

        Entry(String id, String file, float gain) {
            this.id = id;
            this.file = file;
            this.gain = gain;
        }
    }

    final boolean playing;
    final List<Entry> tracks;

    private MixRequest(boolean playing, List<Entry> tracks) {
        this.playing = playing && !tracks.isEmpty();
        this.tracks = tracks;
    }

    static MixRequest parse(JSObject data) {
        Object playing = data.opt("playing");
        Object rawTracks = data.opt("tracks");
        if (!(playing instanceof Boolean) || !(rawTracks instanceof JSONArray)) {
            throw new IllegalArgumentException("playing must be a boolean and tracks must be an array");
        }
        float master = volume(data.opt("masterVolume"), "masterVolume");
        JSONArray array = (JSONArray) rawTracks;
        if (array.length() > MAX_TRACKS) {
            throw new IllegalArgumentException("At most 16 tracks are supported");
        }
        List<Entry> entries = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < array.length(); i++) {
            Object item = array.opt(i);
            if (!(item instanceof JSONObject)) {
                throw new IllegalArgumentException("Each track must be an object");
            }
            JSONObject track = (JSONObject) item;
            Object id = track.opt("id");
            Object file = track.opt("file");
            if (!(id instanceof String) || !ID.matcher((String) id).matches() || !ids.add((String) id)) {
                throw new IllegalArgumentException("Track ids must be unique safe identifiers");
            }
            if (!(file instanceof String) || !FILE.matcher((String) file).matches()) {
                throw new IllegalArgumentException("file must be a bundled wav, mp3, m4a or aac basename");
            }
            entries.add(new Entry((String) id, (String) file, master * volume(track.opt("volume"), "volume")));
        }
        return new MixRequest((Boolean) playing, entries);
    }

    private static float volume(Object raw, String name) {
        if (!(raw instanceof Number)) {
            throw new IllegalArgumentException(name + " must be a finite number");
        }
        double value = ((Number) raw).doubleValue();
        if (!Double.isFinite(value)) {
            throw new IllegalArgumentException(name + " must be a finite number");
        }
        return (float) Math.max(0.0, Math.min(1.0, value));
    }
}
