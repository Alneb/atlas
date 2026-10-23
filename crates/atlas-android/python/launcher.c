/* `python3` on the phone (docs/guides/ANDROID.md, "Python and helpers"): python.org's Android build is for embedding (no
 * program), and Android runs programs only from an app's native-library folder — so this is the program, shipped there
 * as libpython3exe.so beside libpython3.14.so. PYTHONHOME (set by the app) points at the standard library it unpacked. */
#include <Python.h>

int main(int argc, char **argv) { return Py_BytesMain(argc, argv); }
