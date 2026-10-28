"""Rewrite a zip so every stored (uncompressed) entry's data starts on a 4-byte boundary, like zipalign."""
import sys
import zipfile

src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
    for info in zin.infolist():
        data = zin.read(info)
        out = zipfile.ZipInfo(info.filename, date_time=info.date_time)
        out.compress_type = info.compress_type
        out.external_attr = info.external_attr
        if out.compress_type == zipfile.ZIP_STORED:
            # Local header is 30 bytes + name + extra; pad extra so the data offset is aligned.
            offset = zout.fp.tell() + 30 + len(out.filename.encode())
            out.extra = b"\0" * ((4 - offset % 4) % 4)
        zout.writestr(out, data)
