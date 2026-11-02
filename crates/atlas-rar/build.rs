//! libarchive built from its release source, only the RAR and RAR5 readers' needs (no compression libraries, no
//! crypto, no XML, no programs), as a static library. The source tarball is pinned by its SHA-256 and fetched once into
//! OUT_DIR with curl, or taken from `ATLAS_LIBARCHIVE_TARBALL` (offline builds).
//! For Android, cmake uses the NDK's toolchain file: `ANDROID_NDK_ROOT` (crates/atlas-android/build-apk.sh sets it).
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const VERSION: &str = "3.8.10";
const SHA256: &str = "a1bffbe5152cfe869751179e7b16648c87c461cb8c46eee75062efbe164cc57c";
const ANDROID_API: &str = "26"; // build-apk.sh's `api`

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=ATLAS_LIBARCHIVE_TARBALL");
    println!("cargo:rerun-if-env-changed=ANDROID_NDK_ROOT");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let src = source(&out);

    let mut c = cmake::Config::new(&src);
    c.build_target("archive_static").profile("Release");
    for off in [
        "BUILD_SHARED_LIBS", "ENABLE_OPENSSL", "ENABLE_MBEDTLS", "ENABLE_NETTLE", "ENABLE_MD", "ENABLE_LIBB2", "ENABLE_LZ4",
        "ENABLE_LZO", "ENABLE_LZMA", "ENABLE_ZSTD", "ENABLE_ZLIB", "ENABLE_BZip2", "ENABLE_LIBXML2", "ENABLE_BSDXML",
        "ENABLE_EXPAT", "ENABLE_WIN32_XMLLITE", "ENABLE_PCREPOSIX", "ENABLE_PCRE2POSIX", "ENABLE_LIBGCC", "ENABLE_CNG",
        "ENABLE_TAR", "ENABLE_CPIO", "ENABLE_CAT", "ENABLE_UNZIP", "ENABLE_XATTR", "ENABLE_ACL", "ENABLE_ICONV",
        "ENABLE_TEST", "ENABLE_INSTALL", "ENABLE_WERROR",
    ] {
        c.define(off, "OFF");
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        let ndk = std::env::var("ANDROID_NDK_ROOT").expect("ANDROID_NDK_ROOT: the NDK, for libarchive's cmake (build-apk.sh sets it)");
        let abi = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
            "aarch64" => "arm64-v8a",
            "x86_64" => "x86_64",
            "arm" => "armeabi-v7a",
            "x86" => "x86",
            other => panic!("no Android ABI for {other}"),
        };
        c.define("CMAKE_TOOLCHAIN_FILE", Path::new(&ndk).join("build/cmake/android.toolchain.cmake"))
            .define("ANDROID_ABI", abi)
            .define("ANDROID_PLATFORM", format!("android-{ANDROID_API}"));
    }
    let dst = c.build();
    let lib = dst.join("build/libarchive");
    println!("cargo:rustc-link-search=native={}", lib.display());
    println!("cargo:rustc-link-search=native={}", lib.join("Release").display()); // multi-config generators
    println!("cargo:rustc-link-lib=static=archive"); // archive_static's OUTPUT_NAME when no shared library is built
}

/// The unpacked source folder, fetched and checked first when not there yet.
fn source(out: &Path) -> PathBuf {
    let dir = out.join(format!("libarchive-{VERSION}"));
    if dir.join("CMakeLists.txt").is_file() {
        return dir;
    }
    let tarball = match std::env::var_os("ATLAS_LIBARCHIVE_TARBALL") {
        Some(t) => PathBuf::from(t),
        None => {
            let t = out.join(format!("libarchive-{VERSION}.tar.gz"));
            if !t.is_file() {
                let url = format!("https://github.com/libarchive/libarchive/releases/download/v{VERSION}/libarchive-{VERSION}.tar.gz");
                let ok = std::process::Command::new("curl").args(["-fsSL", "--retry", "3", "-o"]).arg(&t).arg(&url).status().map(|s| s.success()).unwrap_or(false);
                assert!(ok, "could not fetch {url} (set ATLAS_LIBARCHIVE_TARBALL to a downloaded copy)");
            }
            t
        }
    };
    let bytes = std::fs::read(&tarball).unwrap_or_else(|e| panic!("{}: {e}", tarball.display()));
    let sum: String = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(sum, SHA256, "{}: not libarchive {VERSION}'s release tarball", tarball.display());
    tar::Archive::new(flate2::read::GzDecoder::new(&bytes[..])).unpack(out).expect("unpack libarchive's source");
    dir
}
