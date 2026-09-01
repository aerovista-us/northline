#!/usr/bin/env python3
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
for src, out, var in [
    ('tracks.json','tracks.generated.js','NORTHLINE_TRACKS'),
    ('store.json','store.generated.js','NORTHLINE_STORE'),
]:
    data = json.loads((root/src).read_text(encoding='utf-8'))
    (root/out).write_text('window.%s=%s;\n' % (var, json.dumps(data, separators=(',',':'), ensure_ascii=False)), encoding='utf-8')
    print(out)
