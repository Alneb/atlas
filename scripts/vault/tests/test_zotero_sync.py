"""zotero_sync.py on a minimal Zotero schema: new items, Zotero-side edits, Atlas-side edits kept,
both-sides conflicts reported, notes as marked blocks, trash reported. Run: uv run --with pyyaml python -m unittest"""
import importlib.util, json, sqlite3, sys, tempfile, unittest
from pathlib import Path
import yaml

spec = importlib.util.spec_from_file_location("zs", Path(__file__).parents[1] / "zotero_sync.py")
zs = importlib.util.module_from_spec(spec); spec.loader.exec_module(zs)
ref_entry = zs.ref_entry  # the script's own (beside it)

SCHEMA = """
create table itemTypes(itemTypeID integer primary key, typeName text);
create table items(itemID integer primary key, itemTypeID int, key text);
create table deletedItems(itemID int);
create table fields(fieldID integer primary key, fieldName text);
create table itemDataValues(valueID integer primary key, value text);
create table itemData(itemID int, fieldID int, valueID int);
create table creatorTypes(creatorTypeID integer primary key, creatorType text);
create table creators(creatorID integer primary key, firstName text, lastName text);
create table itemCreators(itemID int, creatorID int, creatorTypeID int, orderIndex int);
create table tags(tagID integer primary key, name text);
create table itemTags(itemID int, tagID int);
create table collections(collectionID integer primary key, collectionName text);
create table collectionItems(collectionID int, itemID int);
create table itemAttachments(itemID int, parentItemID int, contentType text, path text);
create table itemNotes(itemID int, parentItemID int, note text);
insert into itemTypes values (1,'journalArticle'),(2,'attachment'),(3,'note');
insert into fields values (1,'title'),(2,'date'),(3,'DOI');
insert into creatorTypes values (1,'author');
"""

class Lib:
    """A tiny Zotero library whose rows the test edits between syncs."""
    def __init__(self, root: Path):
        self.dir = root / "Zotero"; (self.dir / "storage").mkdir(parents=True)
        self.db = sqlite3.connect(self.dir / "zotero.sqlite"); self.db.executescript(SCHEMA)
    def field(self, iid, name, value):
        fid = self.db.execute("select fieldID from fields where fieldName=?", (name,)).fetchone()[0]
        self.db.execute("delete from itemData where itemID=? and fieldID=?", (iid, fid))
        vid = self.db.execute("insert into itemDataValues(value) values (?)", (value,)).lastrowid
        self.db.execute("insert into itemData values (?,?,?)", (iid, fid, vid))
    def item(self, iid, key, title, author, date):
        self.db.execute("insert into items values (?,1,?)", (iid, key))
        self.field(iid, "title", title); self.field(iid, "date", date)
        cid = self.db.execute("insert into creators(firstName,lastName) values (?,?)", author).lastrowid
        self.db.execute("insert into itemCreators values (?,?,1,0)", (iid, cid))
    def note(self, iid, key, parent, html):
        self.db.execute("insert or replace into items values (?,3,?)", (iid, key))
        self.db.execute("delete from itemNotes where itemID=?", (iid,))
        self.db.execute("insert into itemNotes values (?,?,?)", (iid, parent, html))
    def pdf(self, iid, key, parent, name):
        self.db.execute("insert into items values (?,2,?)", (iid, key))
        (self.dir / "storage" / key).mkdir(); (self.dir / "storage" / key / name).write_bytes(b"%PDF-1.4\n")
        self.db.execute("insert into itemAttachments values (?,?,?,?)", (iid, parent, "application/pdf", f"storage:{name}"))
    def commit(self):
        self.db.commit()
        p = self.dir / "zotero.sqlite"; st = p.stat()
        import os; os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))  # a new stamp, as Zotero's writes give

class SyncTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()); self.dest = self.tmp / "papers"; self.state = self.tmp / "state.json"
        self.z = Lib(self.tmp)
        self.z.item(1, "AAAA1111", "Electron correlations in narrow bands", ("J.", "Hubbard"), "1963")
        self.z.pdf(2, "PDF00001", 1, "hubbard.pdf")
        self.z.note(3, "NOTE0001", 1, "<p>First note</p>")
        self.z.commit()
    def run_sync(self):
        return zs.sync(self.z.dir, self.dest, self.state, dry=False)
    def info(self, key="hubbard1963electron"):
        return ref_entry.read(self.dest / key)
    def save(self, info, key="hubbard1963electron"):
        ref_entry.write(self.dest / key, info, lambda m: "")

    def test_new_item_with_pdf_and_note(self):
        c, report = self.run_sync()
        self.assertEqual(c["created"], 1)
        self.assertEqual(self.info()["title"], "Electron correlations in narrow bands")
        self.assertFalse((self.dest / "hubbard1963electron" / "info.yaml").exists())  # the fields are the note's
        self.assertIn("published: '1963'", (self.dest / "hubbard1963electron" / "hubbard1963electron.md").read_text())
        self.assertTrue((self.dest / "hubbard1963electron" / "hubbard.pdf").exists())
        note = (self.dest / "hubbard1963electron" / "hubbard1963electron.md").read_text()
        self.assertIn("<!-- zotero:note NOTE0001 -->", note)
        self.assertTrue(note.startswith("---\ntype: literature\ncitekey: hubbard1963electron\n"), note)  # a new note's head
        self.assertIn("```view\ntype: library.paper\n```", note)
        self.assertEqual(self.run_sync()[0].get("skipped"), "no change in Zotero since the last sync")

    def test_zotero_edit_flows_atlas_edit_stays_both_is_a_conflict(self):
        self.run_sync()
        info = self.info(); info["DOI"] = "10.1/atlas"; info["date"] = "1963-11"   # edited in Atlas
        self.save(info)
        self.z.field(1, "title", "Electron correlations in narrow energy bands")    # Zotero: title
        self.z.field(1, "date", "1963-12"); self.z.commit()                            # Zotero: date too
        c, report = self.run_sync()
        i = self.info()
        self.assertEqual(i["title"], "Electron correlations in narrow energy bands")  # Zotero's edit arrives
        self.assertEqual(i["DOI"], "10.1/atlas")                                       # Atlas-only edit stays
        self.assertEqual(i["date"], "1963-11")                                         # both: Atlas kept…
        self.assertEqual(c["conflicts"], 1)                                            # …and reported
        self.assertTrue(any("**date**" in r for r in report))

    def test_notes_keep_atlas_text_and_update_untouched_blocks(self):
        self.run_sync()
        notes = self.dest / "hubbard1963electron" / "hubbard1963electron.md"
        notes.write_text(notes.read_text() + "\nMy own thoughts.\n")  # below the properties: they are the entry
        self.z.note(3, "NOTE0001", 1, "<p>First note, revised</p>"); self.z.note(4, "NOTE0002", 1, "<p>Second</p>"); self.z.commit()
        self.run_sync()
        t = notes.read_text()
        self.assertIn("My own thoughts.", t); self.assertIn("First note, revised", t); self.assertIn("Second", t)
        self.assertNotIn("First note\n", t)

    def test_a_legacy_notes_md_is_renamed_to_the_citekey_and_keeps_its_text(self):
        self.run_sync()
        d = self.dest / "hubbard1963electron"
        # the old layout: the fields in info.yaml, the user's text in notes.md
        (d / "info.yaml").write_text(yaml.safe_dump(self.info()))
        (d / "hubbard1963electron.md").rename(d / "notes.md")
        (d / "notes.md").write_text("<div>imported long ago</div>\n")
        self.z.note(4, "NOTE0002", 1, "<p>Second</p>"); self.z.commit()
        self.run_sync()
        self.assertFalse((d / "notes.md").exists())
        t = (d / "hubbard1963electron.md").read_text()
        self.assertTrue(t.startswith("---\ntype: literature\n"), t)
        self.assertIn("<div>imported long ago</div>", t); self.assertIn("Second", t)

    def test_trashed_item_is_reported_not_deleted(self):
        self.run_sync()
        self.z.db.execute("insert into deletedItems values (1)"); self.z.commit()
        c, report = self.run_sync()
        self.assertEqual(c["trashed"], 1)
        self.assertIsNotNone(self.info())

    def test_first_sync_over_an_old_import_never_overwrites(self):
        d = self.dest / "hubbard1963electron"; d.mkdir(parents=True)
        (d / "info.yaml").write_text(yaml.safe_dump({"title": "My retitled paper", "zotero_key": "AAAA1111", "citekey": "hubbard1963electron"}))
        c, report = self.run_sync()
        self.assertEqual(self.info()["title"], "My retitled paper")
        self.assertEqual(self.info()["date"], "1963")  # gaps are filled
        self.assertEqual(c["conflicts"], 1)

if __name__ == "__main__":
    unittest.main()
