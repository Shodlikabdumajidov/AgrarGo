#!/usr/bin/env python3
"""AgrarGo yorug' (Light) mavzu generatori: css/light.css ni quyidagilardan quradi
  1) index.html dagi <style> bloki (qo'lda yozilgan klasslar) — har bir rang xususiyat roliga qarab (matn / fon / chegara / soya) ochiq palitraga o'tkaziladi;
  2) index.html va js/*.js da ishlatilgan Tailwind rang klasslari (bg-slate-900, text-white, border-white/10, ...) uchun moslashtirilgan qoidalar;
  3) css/light.extra.css — qo'lda yozilgan qo'shimchalar.
Palitra AgrarGo logotipidan: chuqur o'rmon yashili, barg yashili, tuproq/qum ranglari. Sof oq (#FFF) ishlatilmaydi.
Ishga tushirish:  python3 tools/build-light-theme.py
"""
import colorsys, glob, os, re, sys
import tinycss2

ROOT = os.path.join(os.path.dirname(__file__), '..')
SCOPE = 'html[data-theme="light"]'

# ---------- Palitra ----------
PAGE = (232, 237, 216)    # sahifa foni: juda och qum-yashil
CARD = (243, 242, 228)    # kartochka: och qum (oq emas)
CARD2 = (230, 234, 212)
INK = (18, 48, 31)        # asosiy matn: chuqur o'rmon yashili
INK2 = (40, 66, 48)
MUTED = (74, 102, 80)     # ikkilamchi matn
GREEN_TXT = (9, 95, 47)  # yashil matn (sarlavha/aksent) — och fonda kontrastli
LINE = (20, 80, 40)       # chiziq/chegara tusi

def lum(r, g, b):
    f = lambda c: (c / 255) / 12.92 if c / 255 <= 0.03928 else (((c / 255) + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def hsl(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return h * 360, s, l

def rgba(c, a):
    a = max(0, min(1, a))
    return f'rgba({c[0]},{c[1]},{c[2]},{round(a, 3):g})'

HEX = re.compile(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b')
FUNC = re.compile(r'rgba?\(\s*([^)]*?)\)', re.I)

def parse_color(s):
    s = s.strip()
    m = re.fullmatch(r'#([0-9a-fA-F]+)', s)
    if m:
        h = m.group(1)
        if len(h) in (3, 4): h = ''.join(ch * 2 for ch in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1
        return r, g, b, a
    m = re.fullmatch(r'rgba?\(\s*([^)]*)\)', s, re.I)
    if m:
        parts = re.split(r'[,\s/]+', m.group(1).strip())
        try:
            r, g, b = (float(p.rstrip('%')) for p in parts[:3])
            a = float(parts[3]) if len(parts) > 3 else 1
            return int(r), int(g), int(b), a
        except ValueError:
            return None
    return None

# ---------- Rang xaritalari (rolga qarab) ----------
def map_text(r, g, b, a):
    L = lum(r, g, b); h, s, l = hsl(r, g, b)
    if L < 0.08: return None  # allaqachon to'q matn (masalan, tugma ustidagi #022c22): o'zgarmaydi
    if s < 0.2:
        c = INK if L > 0.8 else INK2 if L > 0.5 else MUTED
        return rgba(c, a)
    if 90 <= h <= 175:      # yashil / zumrad matn
        return rgba(GREEN_TXT, a)
    # boshqa ranglar (amber, sky, rose, ...): xuddi shu tus, to'q va to'yingan
    rr, gg, bb = colorsys.hls_to_rgb(h / 360, 0.27, min(0.75, max(0.45, s)))
    return rgba((int(rr * 255), int(gg * 255), int(bb * 255)), a)

def map_surface(r, g, b, a, role):
    """role: 'bg' | 'border' | 'shadow'"""
    L = lum(r, g, b); h, s, l = hsl(r, g, b)
    if role == 'shadow':
        if s > 0.3 and 90 <= h <= 175: return rgba((10, 110, 55), a * 0.6)
        return rgba((30, 60, 35), a * 0.4)
    if L < 0.02 and s < 0.35:                       # qora / deyarli qora
        return rgba((26, 54, 34), a * 0.55) if (role == 'bg' and a < 1) else rgba(PAGE if role == 'bg' else LINE, 1 if role == 'bg' else .3)
    if L < 0.06 and 140 <= h <= 175 and s > 0.2:      # to'q yashil (emerald-900/950) sirtlar -> och yashil tus
        return rgba(LINE, min(.5, a + .05)) if role == 'border' else rgba((200, 224, 184), a)
    if L < 0.06 or (L < 0.14 and s < 0.55):          # to'q slate / navy sirtlar
        if role == 'border': return rgba(LINE, min(.5, a * 1.0 + .05))
        c = PAGE if L < 0.004 else CARD2 if L > 0.05 else CARD
        return rgba(c, a)
    if L > 0.75 and s < 0.3:                          # oq / oqish
        if role == 'border': return rgba(LINE, min(.55, a * 1.3 + .04)) if a < 1 else rgba((201, 211, 180), 1)
        return rgba(LINE, a * 0.7) if a < 1 else rgba(CARD, 1)
    if s < 0.25:                                      # kulrang / och slate fon-chiziqlar
        return rgba(LINE, min(.5, a * .8)) if (role == 'border' or a < 1) else rgba((190, 202, 170), 1)
    # to'yingan (zumrad, amber, ko'k, qizil...)
    if role == 'border':
        rr, gg, bb = colorsys.hls_to_rgb(h / 360, 0.32, min(0.8, s))
        return rgba((int(rr * 255), int(gg * 255), int(bb * 255)), min(1, a * 1.25))
    if a < 1:
        rr, gg, bb = colorsys.hls_to_rgb(h / 360, 0.38, min(0.8, s))
        return rgba((int(rr * 255), int(gg * 255), int(bb * 255)), min(1, a * 0.9))
    return None   # yorqin to'q aksent fon (tugma) — o'zgarmaydi

TEXT_PROPS = {'color', 'fill', 'stroke', 'caret-color', 'text-decoration-color', '-webkit-text-fill-color', 'column-rule-color'}
URL = re.compile(r'url\((?:[^()]|\([^()]*\))*\)', re.I)

def map_value(prop, value):
    """Deklaratsiya qiymatidagi barcha ranglarni mavzuga o'tkazadi; o'zgarmasa None"""
    if prop.startswith('--'): return None
    if prop in TEXT_PROPS: role = 'text'
    elif prop.startswith('background'): role = 'bg'
    elif prop.startswith('border') or prop.startswith('outline'): role = 'border'
    elif prop in ('box-shadow', 'text-shadow', 'filter', 'drop-shadow'): role = 'shadow'
    else: return None
    chunks = re.split(f'({URL.pattern})', value, flags=re.I)
    changed = False
    out = []
    for ch in chunks:
        if ch.lower().startswith('url('):
            out.append(ch); continue
        def sub(m):
            nonlocal changed
            c = parse_color(m.group(0))
            if not c: return m.group(0)
            r, g, b, a = c
            res = map_text(r, g, b, a) if role == 'text' else map_surface(r, g, b, a, role)
            if res is None: return m.group(0)
            changed = True
            return res
        ch = HEX.sub(sub, ch)
        ch = FUNC.sub(lambda m: sub(m), ch)
        out.append(ch)
    # nomli ranglar
    res = ''.join(out)
    for name, c in (('white', CARD), ('black', None)):
        if re.search(rf'(?<![\w-]){name}(?![\w-])', res) and role in ('bg', 'border', 'text'):
            if role == 'text' and name == 'white': res = re.sub(r'(?<![\w-])white(?![\w-])', rgba(INK, 1), res); changed = True
            elif role == 'bg' and name == 'white': res = re.sub(r'(?<![\w-])white(?![\w-])', rgba(CARD, 1), res); changed = True
    return res if changed else None

def split_selectors(prelude):
    out, depth, cur = [], 0, ''
    for ch in prelude:
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == ',' and depth == 0: out.append(cur.strip()); cur = ''
        else: cur += ch
    if cur.strip(): out.append(cur.strip())
    return out

def scope(sel):
    sel = sel.strip()
    if sel.startswith(':root'): return SCOPE + sel[5:]
    if re.match(r'^html(?![\w-])', sel): return SCOPE + sel[4:]
    return f'{SCOPE} {sel}'

def process_rules(rules, depth=0):
    out = []
    for r in rules:
        if r.type == 'qualified-rule':
            decls = tinycss2.parse_declaration_list(r.content, skip_comments=True, skip_whitespace=True)
            kept = []
            for d in decls:
                if d.type != 'declaration': continue
                val = tinycss2.serialize(d.value).strip()
                new = map_value(d.lower_name, val)
                if new is not None:
                    kept.append(f'{d.name}: {new}' + (' !important' if d.important else ''))
            if kept:
                sels = ', '.join(scope(s) for s in split_selectors(tinycss2.serialize(r.prelude)))
                out.append(f'{sels} {{ ' + '; '.join(kept) + '; }')
        elif r.type == 'at-rule' and r.lower_at_keyword in ('media', 'supports') and r.content is not None:
            inner = process_rules(tinycss2.parse_rule_list(r.content, skip_comments=True, skip_whitespace=True), depth + 1)
            if inner:
                out.append(f'@{r.at_keyword} {tinycss2.serialize(r.prelude).strip()} {{\n' + '\n'.join(inner) + '\n}')
    return out

# ---------- Tailwind klasslari ----------
SLATE_BG = {950: PAGE, 900: CARD, 800: CARD2, 700: (211, 220, 188), 600: (180, 194, 159), 500: (141, 162, 131), 400: (164, 181, 154), 300: (223, 230, 204), 200: (234, 238, 217), 100: (243, 244, 228), 50: CARD}
SLATE_TXT = {950: (10, 36, 20), 900: (14, 42, 24), 800: (20, 53, 33), 700: (28, 69, 41), 600: (44, 90, 56), 500: (64, 90, 70), 400: (66, 93, 72), 300: (50, 77, 58), 200: (40, 67, 47), 100: (26, 53, 35), 50: INK}
HUE_TXT = {'emerald': (10, 100, 50), 'green': (21, 112, 52), 'teal': (15, 118, 110), 'amber': (146, 74, 8), 'orange': (176, 62, 14), 'rose': (178, 24, 58), 'red': (176, 28, 28),
           'sky': (3, 98, 150), 'blue': (30, 78, 184), 'indigo': (67, 56, 202), 'violet': (109, 40, 217), 'purple': (126, 34, 190), 'yellow': (133, 90, 8), 'lime': (63, 108, 8), 'cyan': (14, 116, 144), 'pink': (190, 24, 93)}
HUE_RGB = {'emerald': (16, 150, 80), 'green': (22, 150, 70), 'teal': (15, 140, 125), 'amber': (200, 130, 10), 'orange': (220, 100, 30), 'rose': (210, 50, 90), 'red': (210, 50, 50),
           'sky': (14, 130, 190), 'blue': (50, 100, 220), 'indigo': (80, 70, 220), 'violet': (120, 70, 230), 'purple': (150, 70, 210), 'yellow': (200, 150, 10), 'lime': (101, 160, 20), 'cyan': (20, 150, 180), 'pink': (220, 60, 130)}
EMERALD_DARK_BG = {950: (176, 208, 160), 900: (186, 214, 168), 800: (196, 220, 176)}

TOKEN = re.compile(r'^((?:[a-z0-9\-]+:)*)(!?)(bg|text|border|from|via|to|placeholder|fill|stroke|divide)-([a-z]+(?:-\d{2,3})?|white|black|transparent|current)(?:/(\d{1,3}))?$')

def tw_color(util, color, alpha):
    """Tailwind rangi -> yorug' mavzudagi qiymat (yoki None: o'zgarmaydi)"""
    a = 1 if alpha is None else int(alpha) / 100
    if color in ('transparent', 'current'): return None
    m = re.match(r'([a-z]+)(?:-(\d+))?$', color)
    name, shade = m.group(1), int(m.group(2)) if m.group(2) else None
    isbg = util in ('bg', 'from', 'via', 'to')
    if name == 'white':
        if util in ('text', 'fill', 'stroke', 'placeholder'): return rgba(INK, max(a, .85) if alpha else 1)
        if isbg: return rgba(CARD, 1) if alpha is None else rgba(LINE, a * 0.7)
        return rgba((201, 211, 180), 1) if alpha is None else rgba(LINE, min(.55, a * 1.25 + .04))
    if name == 'black':
        if util in ('text', 'fill', 'stroke'): return None
        return rgba((26, 54, 34), a * 0.55 if alpha else 1) if isbg else rgba(LINE, min(.6, a * .8 + .1))
    if name in ('slate', 'gray', 'zinc', 'neutral', 'stone'):
        if util in ('text', 'fill', 'stroke', 'placeholder'): return rgba(SLATE_TXT.get(shade, MUTED), max(a, .9))
        if isbg: return rgba(SLATE_BG.get(shade, CARD), a)
        return rgba(LINE, min(.6, a * 0.9 + .1)) if shade and shade <= 700 else rgba((141, 162, 131), a)   # border
    if name in HUE_TXT:
        if util in ('text', 'fill', 'stroke', 'placeholder'):
            return rgba(HUE_TXT[name], max(a, .9)) if shade is None or shade <= 500 else None
        if name == 'emerald' and isbg and shade in EMERALD_DARK_BG: return rgba(EMERALD_DARK_BG[shade], a)
        if util == 'border' or (isbg and alpha is not None):
            if util == 'border':
                return rgba(HUE_TXT[name] if (shade or 500) >= 400 else HUE_RGB[name], min(1, a * 1.3)) if alpha else None
            return rgba(HUE_RGB[name], a * 0.9)
        return None   # to'q to'yingan fon (tugma) o'zgarmaydi
    return None

def esc(tok): return re.sub(r'([^\w-])', r'\\\1', tok)
BP = {'sm': 640, 'md': 768, 'lg': 1024, 'xl': 1280}

def tw_rule(tok):
    m = TOKEN.match(tok)
    if not m: return None
    variants = [v for v in m.group(1).split(':') if v]
    imp = ' !important' if m.group(2) else ''
    util, color, alpha = m.group(3), m.group(4), m.group(5)
    val = tw_color(util, color, alpha)
    if val is None: return None
    base = '.' + esc(tok)
    pre, post, media = '', '', None
    for v in variants:
        if v in BP: media = BP[v]
        elif v == 'hover': post += ':hover'
        elif v == 'focus': post += ':focus'
        elif v == 'active': post += ':active'
        elif v == 'disabled': post += ':disabled'
        elif v == 'placeholder': post += '::placeholder'
        elif v == 'group-hover': pre = '.group:hover '
        else: return None
    sel = f'{SCOPE} {pre}{base}{post}'
    if util == 'bg': decl = f'background-color: {val}'
    elif util == 'text': decl = f'color: {val}'
    elif util == 'border': decl = f'border-color: {val}'
    elif util == 'fill': decl = f'fill: {val}'
    elif util == 'stroke': decl = f'stroke: {val}'
    elif util == 'placeholder': sel = f'{SCOPE} {base}::placeholder'; decl = f'color: {val}'
    elif util == 'divide': sel = f'{SCOPE} {base} > :not([hidden]) ~ :not([hidden])'; decl = f'border-color: {val}'
    elif util == 'from': decl = f'--tw-gradient-from: {val}; --tw-gradient-to: {val.replace(val.split(",")[-1], "0)") if val.startswith("rgba") else val}; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to)'
    elif util == 'via': decl = f'--tw-gradient-stops: var(--tw-gradient-from), {val}, var(--tw-gradient-to)'
    elif util == 'to': decl = f'--tw-gradient-to: {val}'
    else: return None
    rule = f'{sel} {{ {decl}{imp}; }}'
    return f'@media (min-width: {media}px) {{ {rule} }}' if media else rule

def collect_tokens():
    src = open(os.path.join(ROOT, 'index.html'), encoding='utf8').read()
    for f in glob.glob(os.path.join(ROOT, 'js', '*.js')):
        if 'agrar-book' in f: continue
        src += open(f, encoding='utf8').read()
    pat = r"(?<![\w-])((?:[a-z0-9\-]+:)*!?(?:bg|text|border|from|via|to|placeholder|fill|stroke|divide)-(?:[a-z]+-\d{2,3}|white|black|transparent|current)(?:/\d{1,3})?)"
    return sorted(set(re.findall(pat, src)))

# Rangli (to'q) tugma ustidagi "text-white" yozuvi o'qiladigan qolishi kerak (sof oq emas, qum-oq)
SOLID_BG = ['emerald-600', 'emerald-700', 'blue-500', 'blue-600', 'rose-500', 'rose-600', 'purple-500', 'purple-600', 'violet-500', 'violet-600', 'indigo-500', 'sky-600', 'teal-600', 'amber-600', 'orange-600', 'red-500', 'red-600']

def main():
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf8').read()
    style = '\n'.join(re.findall(r'<style>(.*?)</style>', html, re.S))
    rules = tinycss2.parse_stylesheet(style, skip_comments=True, skip_whitespace=True)
    custom = process_rules(rules)
    tw = [r for r in (tw_rule(t) for t in collect_tokens()) if r]
    extra_path = os.path.join(ROOT, 'css', 'light.extra.css')
    extra = open(extra_path, encoding='utf8').read() if os.path.exists(extra_path) else ''
    sand = rgba((246, 243, 228), 1)
    solid = [f'{SCOPE} .text-white.bg-{b}, {SCOPE} .bg-{b} .text-white {{ color: {sand}; }}' for b in SOLID_BG]
    header = '/* AVTOMATIK YARATILGAN: python3 tools/build-light-theme.py (qo\'lda tahrirlamang; o\'zgarishlar css/light.extra.css ga) */\n'
    css = header + f'\n/* ===== index.html <style> bloki -> yorug\' mavzu ({len(custom)} qoida) ===== */\n' + '\n'.join(custom) + \
        f'\n\n/* ===== Tailwind rang klasslari ({len(tw)} qoida) ===== */\n' + '\n'.join(tw) + '\n\n/* ===== Rangli tugmalar ustidagi matn ===== */\n' + '\n'.join(solid) + \
        '\n\n/* ===== Qo\'lda qo\'shimchalar (css/light.extra.css) ===== */\n' + extra
    open(os.path.join(ROOT, 'css', 'light.css'), 'w', encoding='utf8').write(css)
    print(f'css/light.css: {len(custom)} maxsus + {len(tw)} Tailwind qoida, {len(css) // 1024} KB')

if __name__ == '__main__':
    main()
