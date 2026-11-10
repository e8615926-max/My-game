#!/usr/bin/env python3
"""Bundle the game into a single self-contained file: WorldSimulator.html"""
import re
h = open('index.html', encoding='utf-8').read()
h = h.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + open('css/style.css', encoding='utf-8').read() + '\n</style>')
h = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>\n' + open(m.group(1), encoding='utf-8').read() + '\n</script>', h)
open('WorldSimulator.html', 'w', encoding='utf-8').write(h)
print('WorldSimulator.html', len(h), 'bytes')
