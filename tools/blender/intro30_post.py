"""Finition de l'intro Ir Ganda (30 s) : étalonnage sobre (semi-réaliste), lueur et vignette légères, grain fin, éclairs blancs des explosions (flash_p*.json), bandes de cinéma,
cartons de texte en français, titre final avec l'emblème du renard fennec, fondus, puis MP4 avec ffmpeg.
Entrée : assets/intro3/frames/f_0001..f_0636.png (rendus par intro30.py, une partie à la fois). Sortie : assets/intro3/post/ et les MP4.
Usage : python -I tools/blender/intro30_post.py <partie|final> [--no-encode]      (partie = 1, 2 ou 3 ; final = les trois parties + le titre)"""
import json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
BASE = os.path.join(PROJ, "assets", "intro3")
FR, POST = os.path.join(BASE, "frames"), os.path.join(BASE, "post")
FFMPEG = shutil.which("ffmpeg") or r"C:\Users\Kabakoo Apprenant.e\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
W, H, FPS = 1280, 720, 24
LAST, TOTAL = 636, 720
PARTS = {"1": (1, 228), "2": (229, 432), "3": (433, 636), "final": (1, 720)}
BAR = int(H - W / 2.39) // 2
F_NARR = r"C:\Windows\Fonts\georgiai.ttf"
F_TITLE = r"C:\Windows\Fonts\bahnschrift.ttf"
F_SHOUT = r"C:\Windows\Fonts\impact.ttf"
FLASH = {}
for p in (1, 2, 3):
    fp = os.path.join(BASE, f"flash_p{p}.json")
    if os.path.exists(fp):
        for k, v in json.load(open(fp)).items():
            FLASH[int(k)] = max(FLASH.get(int(k), 0.0), v)
rng = np.random.default_rng(11)

CARDS = [  # (début s, fin s, lignes, style)
    (0.3, 2.8, ["IR GANDA", "Un pays du Sahel. Une base militaire."], "narr"),
    (3.1, 4.9, ["Un projet de l'État :", "sécuriser le territoire."], "narr"),
    (5.2, 7.4, ["Une milice de la région,", "mécontente, passe à l'attaque."], "narr"),
    (7.7, 9.4, ["Le feu. Le chaos."], "narr"),
    (9.7, 11.4, ["L'installation est en flammes."], "narr"),
    (11.7, 13.9, ["Le lendemain, la milice est anéantie.", "Sans l'aval de l'État."], "narr"),
    (14.2, 15.9, ["Par une société de mercenaires :", "ARTEX."], "narr"),
    (16.2, 17.9, ["Quelques jours plus tard,", "des positions militaires sont frappées."], "narr"),
    (18.2, 20.4, ["« Nous, ARTEX, réclamons l'indépendance du nord et de l'est,", "la restitution des territoires légitimes.", "Pour la gloire de ......, nous vaincrons. »"], "comm"),
    (20.6, 21.55, ["JOURNAL · URGENT", "Le pays fait face à un grave problème sécuritaire,", "défiant sa souveraineté et son intégrité territoriale..."], "tv"),
    (21.6, 22.45, ["LE PRÉSIDENT", "« Notre pays est attaqué. Nous passons en alerte maximale. »"], "tv"),
    (22.6, 23.9, ["ATTENTION... on est attaqué !"], "shout"),
    (24.3, 26.4, ["Frappe sur le Palais présidentiel."], "narr"),
]
TITLE_START = LAST / FPS


def fade(t, t0, t1, fin=0.35, fout=0.35):
    if t < t0 or t > t1:
        return 0.0
    return max(0.0, min(1.0, min((t - t0) / fin, (t1 - t) / fout)))


def grade(img):
    """Étalonnage de cinéma sobre : chaleur légère, contraste doux, lueur discrète, vignette légère, grain fin (rendu semi-réaliste, pas de couleurs poussées)."""
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    lum = a.mean(2, keepdims=True)
    a = a * (np.array([0.97, 1.0, 1.04], np.float32) * (1 - lum) + np.array([1.04, 1.0, 0.93], np.float32) * lum)
    a = np.clip((a - 0.5) * 1.06 + 0.5, 0, 1)
    g = a.mean(2, keepdims=True); a = np.clip(g + (a - g) * 0.97, 0, 1)
    bright = np.clip((a - 0.78) / 0.22, 0, 1)
    bl = Image.fromarray((bright * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(20))
    a = np.clip(a + np.asarray(bl).astype(np.float32) / 255.0 * 0.20 * np.array([1.0, 0.92, 0.78], np.float32), 0, 1)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    a *= (1 - 0.22 * np.clip(r - 0.5, 0, 1) ** 1.6)[..., None]
    a += rng.normal(0, 0.009, a.shape[:2])[..., None].astype(np.float32)
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def text_layer(lines, alpha, style, t):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    if alpha <= 0:
        return lay
    A = lambda v: int(v * alpha)
    if style == "narr":
        big = ImageFont.truetype(F_NARR, 38); small = ImageFont.truetype(F_TITLE, 22)
        heads = [ln.isupper() and len(lines) > 1 and i == 0 for i, ln in enumerate(lines)]
        y = H - BAR - 50 - sum(30 if h else 46 for h in heads)
        for i, ln in enumerate(lines):
            f = small if heads[i] else big
            txt = " ".join(ln) if heads[i] else ln
            x = (W - d.textlength(txt, font=f)) / 2
            d.text((x + 2, y + 2), txt, font=f, fill=(0, 0, 0, A(190)))
            d.text((x, y), txt, font=f, fill=(255, 190, 110, A(255)) if heads[i] else (255, 238, 212, A(255)))
            y += 30 if heads[i] else 46
    elif style == "comm":
        f = ImageFont.truetype(F_TITLE, 32); n = len(lines)
        ph = n * 46 + 34; y0 = H / 2 - ph / 2 + 40
        d.rectangle([W * 0.08, y0 - 14, W * 0.92, y0 + ph - 14], fill=(0, 0, 0, A(170)))
        d.rectangle([W * 0.08, y0 - 14, W * 0.08 + 6, y0 + ph - 14], fill=(235, 235, 235, A(255)))
        for i, ln in enumerate(lines):
            d.text((W * 0.08 + 28, y0 + 8 + i * 46), ln, font=f, fill=(245, 245, 240, A(255)))
    elif style == "tv":
        tag = ImageFont.truetype(F_TITLE, 24); f = ImageFont.truetype(F_TITLE, 30)
        n = len(lines) - 1
        y0 = H - BAR - 30 - (n * 40 + 52)
        d.rectangle([60, y0, W - 60, y0 + n * 40 + 52], fill=(8, 12, 20, A(205)))
        d.rectangle([60, y0, 68, y0 + n * 40 + 52], fill=(220, 30, 30, A(255)))
        d.rectangle([80, y0 + 10, 80 + d.textlength(lines[0], font=tag) + 20, y0 + 40], fill=(200, 25, 25, A(255)))
        d.text((90, y0 + 12), lines[0], font=tag, fill=(255, 255, 255, A(255)))
        for i, ln in enumerate(lines[1:]):
            d.text((84, y0 + 48 + i * 40), ln, font=f, fill=(240, 244, 250, A(255)))
    elif style == "shout":
        f = ImageFont.truetype(F_SHOUT, 70)
        txt = lines[0]; jx = int(3 * np.sin(t * 40)); jy = int(2 * np.sin(t * 53 + 1))
        x = (W - d.textlength(txt, font=f)) / 2 + jx; y = H - BAR - 150 + jy
        d.text((x + 4, y + 4), txt, font=f, fill=(0, 0, 0, A(220)))
        d.text((x, y), txt, font=f, fill=(255, 60, 40, A(255)))
    return lay


def logo():
    im = Image.open(os.path.join(PROJ, "assets", "intro", "drapeau_artex.png")).convert("L")
    im = im.resize((260, int(260 * im.height / im.width)), Image.LANCZOS)
    rgba = Image.new("RGBA", im.size, (255, 244, 225, 0)); rgba.putalpha(im)
    return rgba


def title_card(img, t, mark):
    u = (t - TITLE_START) / (TOTAL / FPS - TITLE_START)
    zoom = 1.0 + 0.05 * u
    cw, ch = int(W / zoom), int(H / zoom)
    img = img.crop(((W - cw) // 2, (H - ch) // 2, (W + cw) // 2, (H + ch) // 2)).resize((W, H), Image.LANCZOS)
    dark = min(0.78, u * 2.4 * 0.78)
    img = Image.fromarray((np.asarray(img).astype(np.float32) * (1 - dark)).astype(np.uint8))
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    al = fade(t, TITLE_START + 0.3, TOTAL / FPS - 0.4, 0.7, 0.4)
    tf = ImageFont.truetype(F_TITLE, 112); sf = ImageFont.truetype(F_NARR, 30)
    title = "SAHEL GAME"; track = 14
    tw = sum(d.textlength(c, font=tf) for c in title) + track * (len(title) - 1)
    x = (W - tw) / 2; y = H / 2 - 40
    for c in title:
        d.text((x + 3, y + 4), c, font=tf, fill=(0, 0, 0, int(200 * al)))
        d.text((x, y), c, font=tf, fill=(255, 226, 170, int(255 * al)))
        x += d.textlength(c, font=tf) + track
    al2 = fade(t, TITLE_START + 1.0, TOTAL / FPS - 0.4, 0.7, 0.4)
    sub = "Ir Ganda  ·  L'ombre d'Artex"
    sw = d.textlength(sub, font=sf)
    d.text(((W - sw) / 2 + 2, H / 2 + 100), sub, font=sf, fill=(0, 0, 0, int(190 * al2)))
    d.text(((W - sw) / 2, H / 2 + 98), sub, font=sf, fill=(255, 238, 212, int(255 * al2)))
    lg = mark.copy(); lg.putalpha(lg.getchannel("A").point(lambda v: int(v * al2)))
    lay.alpha_composite(lg, (int((W - lg.width) / 2), int(H / 2 - 40 - lg.height - 20)))
    return Image.alpha_composite(img.convert("RGBA"), lay).convert("RGB")


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "1"
    a, b = PARTS[which]
    os.makedirs(POST, exist_ok=True)
    mark = logo()
    last = None
    for n in range(a, b + 1):
        t = (n - 1) / FPS
        out = os.path.join(POST, f"p_{n:04d}.png")
        if n <= LAST:
            src = os.path.join(FR, f"f_{n:04d}.png")
            if not os.path.exists(src):
                print("image manquante", n); return
            img = grade(Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS))
            fl = FLASH.get(n, 0.0)
            if fl > 0:
                arr = np.asarray(img).astype(np.float32); arr = arr + (255 - arr) * min(1.0, fl) * 0.7
                img = Image.fromarray(arr.astype(np.uint8))
            rgba = img.convert("RGBA")
            for t0, t1, lines, style in CARDS:
                al = fade(t, t0, t1)
                if al > 0:
                    rgba = Image.alpha_composite(rgba, text_layer(lines, al, style, t))
            img = rgba.convert("RGB")
            if n == LAST:
                last = img.copy()
        else:
            if last is None:
                last = grade(Image.open(os.path.join(FR, f"f_{LAST:04d}.png")).convert("RGB").resize((W, H), Image.LANCZOS))
            img = title_card(last.copy(), t, mark)
        d = ImageDraw.Draw(img); d.rectangle([0, 0, W, BAR], fill=(0, 0, 0)); d.rectangle([0, H - BAR, W, H], fill=(0, 0, 0))
        k = 1.0
        if which in ("1", "final"):
            k = min(k, t / 0.6)
        if which in ("final",):
            k = min(k, (TOTAL / FPS - t) / 0.45 if t > TOTAL / FPS - 0.45 else 1.0)
        if k < 1.0:
            img = Image.fromarray((np.asarray(img).astype(np.float32) * max(0.0, k)).astype(np.uint8))
        img.save(out)
        if n % 60 == 0:
            print("image", n, flush=True)
    if "--no-encode" in sys.argv:
        return
    name = "Sahel_Game_Intro_30s.mp4" if which == "final" else f"partie{which}.mp4"
    mp4 = os.path.join(BASE, name)
    cmd = [FFMPEG, "-y", "-framerate", str(FPS), "-start_number", str(a), "-i", os.path.join(POST, "p_%04d.png"), "-frames:v", str(b - a + 1),
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow", "-movflags", "+faststart", mp4]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stderr[-400:] if r.returncode else f"MP4 : {mp4} ({os.path.getsize(mp4) / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()
