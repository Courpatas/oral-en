# Génère les icônes PNG sans dépendance : fond sombre, bulle turquoise, onde sonore.
# Usage : python3 tools/make_icons.py icons
import math
import struct
import sys
import zlib


def png(path, size):
    bg, acc, ink = (16, 20, 24), (79, 179, 169), (16, 20, 24)
    c, r = size / 2, size * 0.30
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            px = bg
            d = math.hypot(x + 0.5 - c, y + 0.5 - c * 0.96)
            tail = (size * 0.27 < x < size * 0.42 and size * 0.62 < y < size * 0.80
                    and (x - size * 0.27) > (y - size * 0.62) * 0.9)
            if d < r or tail:
                px = acc
            for i, h in enumerate((0.09, 0.16, 0.09)):
                bx = c + (i - 1) * size * 0.11
                if abs(x + 0.5 - bx) < size * 0.03 and abs(y + 0.5 - c * 0.96) < size * h:
                    px = ink
            row += bytes(px)
        rows.append(bytes(row))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n'
                + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
                + chunk(b'IEND', b''))


out = sys.argv[1]
png(out + '/icon-192.png', 192)
png(out + '/icon-512.png', 512)
png(out + '/apple-touch-icon.png', 180)
