//! The note of a thing (docs/design/DESIGN-server-libraries.md §3): the server keeps the thing, the vault keeps what is
//! yours about it — in one note. Every plugin whose things live elsewhere (Audiobookshelf, Suwayomi, Jellyfin) or in a
//! vault file (an EPUB, a manga folder) asks here which note is a thing's, and has it made only when the thing has
//! become yours. One rule for the desktop and the phone: both reach it as the catalog's `note` tool.
//!
//! - **Found** by, in order: the vault file's own note (the core's companion: a note claiming the file by its `file`
//!   property, else the one beside it), the IDs anywhere in the vault (a note of the kind's type), then an ID-less note
//!   of that name in the kind's library. A found note gets the IDs and the file link it lacks — nothing else.
//! - **Made** only when [`Why::yours`]: a server item through `add` (its sources, else what the server says) in the
//!   kind's folder; a vault file through the core's companion path, beside it. Never two.
use crate::engine::{Engine, Fail, Host, Pick, Told};
use crate::kind::Kind;
use crate::merge::{identifying, Merged};
use crate::model::{Fields, Ids, KindName, Narration, Stage};
use serde::Serialize;
use serde_json::Value;

/// How far into a thing (0–1) counts as past its start: a few minutes of a long audiobook, a page or two of a book.
pub const PAST_START: f64 = 0.01;

/// What just happened with the thing, as the caller saw it: the one input of the rule.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Why {
    /// opened or listed: the note is looked for, never made
    Opened,
    /// read or listened this far (0–1)
    Progress(f64),
    /// a part of it (a chapter) or the whole marked done
    Finished,
    Rated,
    Reviewed,
    /// written on: a highlight, ink, a bookmark
    Wrote,
    /// "Make a note"
    Asked,
}

impl Why {
    /// The tool's `why` (and `progress` for "progress"); none: only looked for.
    pub fn parse(why: Option<&str>, progress: Option<f64>) -> Result<Why, Fail> {
        Ok(match why.unwrap_or("opened") {
            "opened" | "" => Why::Opened,
            "progress" => Why::Progress(progress.ok_or("why = progress needs `progress` (0–1)")?),
            "finished" => Why::Finished,
            "rated" => Why::Rated,
            "reviewed" => Why::Reviewed,
            "wrote" => Why::Wrote,
            "asked" => Why::Asked,
            other => return Err(format!("why = {other:?}: one of opened, progress, finished, rated, reviewed, wrote, asked")),
        })
    }

    /// The thing has become yours: it gets its note.
    pub fn yours(self) -> bool {
        match self {
            Why::Opened => false,
            Why::Progress(p) => p >= PAST_START,
            Why::Finished | Why::Rated | Why::Reviewed | Why::Wrote | Why::Asked => true,
        }
    }
}

/// A thing as the plugin that shows it knows it.
#[derive(Debug, Clone, Default)]
pub struct Thing {
    pub kind: Option<KindName>,
    /// its IDs: the server's (`audiobookshelf`, `suwayomi`) and stable ones (`isbn`, `url`)
    pub ids: Ids,
    /// what the server says about it (title, author, cover…): a new note's properties where no source says more
    pub known: Fields,
    /// the vault file or folder it is (an EPUB, a manga series' folder), when it is one
    pub file: Option<String>,
    /// the user's own fields there (rating, status): written as `add`'s `own`
    pub own: Fields,
}

#[derive(Debug, Clone, Serialize)]
pub struct Found {
    /// the note; None: the thing is not yours yet and has none
    pub path: Option<String>,
    /// made by this call
    pub made: bool,
}

impl<H: Host> Engine<H> {
    /// The note of `thing`: found, or made when `why` makes it yours (see the module's rule).
    pub fn note_of(&self, thing: &Thing, why: Why) -> Result<Told<Found>, Fail> {
        let mut say = Narration::default();
        let reg = self.load(&mut say);
        let name = reg.filed_as(thing.kind.as_ref().ok_or("`kind` is needed (book, manga, movie…)")?);
        let kind = reg.kinds.get(&name).ok_or_else(|| format!("{name}: no plugin or vault file declares that kind"))?.clone();
        let ids: Ids = thing.ids.iter().filter(|(_, v)| !v.trim().is_empty()).map(|(k, v)| (k.clone(), crate::model::normalise(k, v))).collect();
        if let Some(path) = self.held(&kind, &reg, thing, &ids, &mut say)? {
            self.adopt(&kind, &path, thing, &ids, &mut say)?;
            return Ok(Told { result: Found { path: Some(path), made: false }, steps: say });
        }
        if !why.yours() {
            say.say(Stage::Dedupe, format!("no note yet; not made: the {} is not yours yet ({why:?})", kind.label().to_lowercase()));
            return Ok(Told { result: Found { path: None, made: false }, steps: say });
        }
        let title = thing.known.get("title").map(crate::kind::text_of).filter(|t| !t.trim().is_empty());
        let path = match &thing.file {
            // a vault file's note: the core's companion path, with the kind's type, IDs and what is known
            Some(file) => {
                let mut m = Merged { ids: ids.clone(), ..Merged::default() };
                m.fields = thing.known.clone();
                m.fields.extend(thing.own.clone().into_iter().filter(|(k, _)| k != "review"));
                let props = crate::note::properties(&kind, &m, &thing.own.keys().cloned().collect::<Vec<_>>());
                let stem = file.trim_end_matches('/').rsplit('/').next().unwrap_or(file);
                let title = title.unwrap_or_else(|| stem.rsplit_once('.').map_or(stem, |(s, _)| s).to_string());
                let p = self.host.companion(file, &title, &props)?;
                say.say(Stage::Write, format!("{p}: the note of {file}, made through the core"));
                p
            }
            // a server item: filed as any capture is, from its IDs (its sources), what the server says filling the gaps
            None => {
                let pick = Pick { kind: Some(kind.name.clone()), ids: Some(ids.clone()), own: thing.own.clone(), note: None, known: thing.known.clone() };
                let added = self.add(title.as_deref().unwrap_or(kind.label()), &pick)?;
                say.0.extend(added.steps.0);
                added.result.path
            }
        };
        Ok(Told { result: Found { path: Some(path), made: true }, steps: say })
    }

    /// The note that already holds the thing, if any.
    fn held(&self, kind: &Kind, reg: &crate::contrib::Registry, thing: &Thing, ids: &Ids, say: &mut Narration) -> Result<Option<String>, Fail> {
        if let Some(file) = &thing.file {
            if let Some(p) = self.host.companion_find(file)? {
                say.say(Stage::Dedupe, format!("{p}: the note of {file}"));
                return Ok(Some(p));
            }
        }
        let wanted = identifying(kind, ids);
        if !wanted.is_empty() {
            let props: Vec<String> = kind.ids.iter().filter(|i| wanted.contains_key(&i.id)).map(|i| i.property().to_string()).collect();
            let typed = |p: &Fields| p.get("type").and_then(Value::as_str).is_none_or(|t| t.eq_ignore_ascii_case(kind.note_type()));
            let mut notes = self.host.notes_with(&props)?;
            notes.sort_by(|a, b| a.0.cmp(&b.0));
            for (path, p) in notes.iter().filter(|(_, p)| typed(p)) {
                let have = kind.ids_in(p);
                if let Some((id, v)) = wanted.iter().find(|(id, v)| have.get(*id) == Some(*v)) {
                    say.say(Stage::Dedupe, format!("{path}: holds it (same {id} {v})"));
                    return Ok(Some(path.clone()));
                }
            }
        }
        // a note of that name without IDs in the kind's library (written by hand, or before the catalog)
        let folders = crate::rules::folders(kind, &reg.rules);
        let mut notes = Vec::new();
        for f in &folders {
            notes.extend(self.host.notes_in(f)?);
        }
        let named = notes.into_iter().find(|(path, p)| kind.ids_in(p).is_empty() && crate::engine::named_as(path, p, &thing.known));
        Ok(named.map(|(p, _)| {
            say.say(Stage::Dedupe, format!("{p}: a note of that name without IDs"));
            p
        }))
    }

    /// The IDs, the type and the file link a found note lacks — what ties it to the thing; the rest is the user's.
    fn adopt(&self, kind: &Kind, path: &str, thing: &Thing, ids: &Ids, say: &mut Narration) -> Result<(), Fail> {
        let current = self.host.props(path)?;
        let blank = |k: &str| current.get(k).is_none_or(|v| v.is_null() || v.as_str().is_some_and(|s| s.trim().is_empty()));
        let mut set: Vec<(String, Value)> = Vec::new();
        if blank("type") {
            set.push(("type".into(), Value::String(kind.note_type().into())));
        }
        for (p, v) in kind.id_properties(&identifying(kind, ids)) {
            if blank(&p) {
                set.push((p, Value::String(v)));
            }
        }
        // a note elsewhere (in the kind's folder) claims the vault file, so the file's own lookups find it
        if let Some(file) = &thing.file {
            if blank(CLAIM) && self.host.companion_find(file)?.as_deref() != Some(path) {
                set.push((CLAIM.into(), Value::String(format!("[[{}]]", file.trim_end_matches('/')))));
            }
        }
        for (k, v) in &set {
            self.host.set_property(path, k, v)?;
        }
        if !set.is_empty() {
            say.say(Stage::Write, format!("{path}: {} added", set.iter().map(|(k, _)| k.as_str()).collect::<Vec<_>>().join(", ")));
        }
        Ok(())
    }
}

/// The property a note claims its vault file by (the core's `companion::CLAIM`).
pub const CLAIM: &str = "file";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_thing_is_yours_past_its_start_or_once_you_act_on_it() {
        assert!(!Why::parse(None, None).unwrap().yours());
        assert!(!Why::parse(Some("progress"), Some(0.005)).unwrap().yours(), "a tap on play is not reading");
        assert!(Why::parse(Some("progress"), Some(0.02)).unwrap().yours());
        for w in ["finished", "rated", "reviewed", "wrote", "asked"] {
            assert!(Why::parse(Some(w), None).unwrap().yours(), "{w}");
        }
        assert!(Why::parse(Some("progress"), None).is_err());
        assert!(Why::parse(Some("liked"), None).is_err());
    }
}
