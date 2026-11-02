//! Real RAR archives (libarchive's own test files) unpacked: a RAR4 with a text file and a symlink (skipped), a
//! compressed RAR5.
mod fixtures;

fn unpacked(bytes: &[u8]) -> tempfile::TempDir {
    let d = tempfile::tempdir().unwrap();
    let src = d.path().join("in.rar");
    std::fs::write(&src, bytes).unwrap();
    atlas_rar::unpack(&src, &d.path().join("out")).unwrap();
    d
}

#[test]
fn rar4_text_comes_out_and_the_link_does_not() {
    let d = unpacked(fixtures::RAR4);
    assert_eq!(std::fs::read(d.path().join("out/test.txt")).unwrap(), b"test text document\r\n");
    assert!(!d.path().join("out/testlink").exists(), "only regular files");
}

#[test]
fn rar5_compressed_comes_out_whole() {
    let d = unpacked(fixtures::RAR5);
    assert_eq!(std::fs::metadata(d.path().join("out/test.bin")).unwrap().len(), 1200);
}
