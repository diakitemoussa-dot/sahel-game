"""Finition de l'intro 2 (Ir Ganda, 45 s) : étalonnage, lueur, vignette, grain, éclairs blancs des explosions (flash.json), bandes de cinéma, cartons de texte
en français (narration, communiqué d'Artex, journal télévisé, cri du soldat), titre final avec l'emblème du renard fennec, fondus ; puis MP4 avec ffmpeg.
Entrée : assets/intro2/frames/f_0001..f_1032.png (rendus par s42_intro2.py). Sortie : assets/intro2/post/ et assets/intro2/Sahel_Game_Intro_IrGanda.mp4.
Usage : python -I tools/blender/intro2_post.py [--no-encode]"""
import json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
BASE = os.path.join(PROJ, "assets", "intro2")
FR, POST = os.path.join(BASE, "frames"), os.path.join(BASE, "post")
MP4 = os.path.join(BASE, "Sahel_Game_Intro_IrGanda.mp4")
FFMPEG = shutil.which("ffmpeg") or r"C:\Users\Kabakoo Apprenant.e\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
W, H, FPS = 1280, 720, 24
LAST_RENDER, TOTAL = 1032, 1080
BAR = int(H - W / 2.39) // 2
F_NARR = r"C:\Windows\Fonts\georgiai.ttf"
F_TITLE = r"C:\Windows\Fonts\bahnschrift.ttf"
F_SHOUT = r"C:\Windows\Fonts\impact.ttf"
FLASH = {int(k): v for k, v in json.load(open(os.path.join(BASE, "flash.json"))).items()} if os.path.exists(os.path.join(BASE, "flash.json")) else {}
rng = np.random.default_rng(7)

# (début s, fin s, lignes, style)
CARDS = [
    (0.4, 2.9, ["IR GANDA", "Un pays du Sahel. Une base militaire."], "narr"),
    (3.2, 5.9, ["Un projet de l'État :", "sécuriser le territoire."], "narr"),
    (6.2, 8.9, ["Une milice de la région,", "mécontente, passe à l'attaque."], "narr"),
    (9.2, 11.9, ["Une attaque de masse.", "Le feu. Le chaos."], "narr"),
    (12.2, 14.9, ["L'installation est en flammes."], "narr"),
    (15.2, 18.7, ["Le lendemain, la milice est anéantie.", "Sans l'aval de l'État."], "narr"),
    (19.1, 21.9, ["Par une société de mercenaires :", "ARTEX."], "narr"),
    (22.3, 25.4, ["Quelques jours plus tard,", "des positions militaires sont frappées."], "narr"),
    (26.2, 28.9, ["« Nous, ARTEX, réclamons au nom des peuples", "l'indépendance du nord et de l'est,", "et la restitution des territoires légitimes."], "comm"),
    (29.0, 30.9, ["Pour la gloire de ......,", "nous vaincrons. »"], "comm"),
    (31.3, 33.3, ["JOURNAL · URGENT", "Le pays fait face à un grave problème sécuritaire", "défiant sa souveraineté et son intégrité territoriale..."], "tv"),
    (33.4, 35.0, ["LE PRÉSIDENT", "« Notre pays est attaqué. Nous passons en état d'alerte maximale. »"], "tv"),
    (35.5, 38.6, ["ATTENTION... on est attaqué !"], "shout"),
    (39.4, 42.7, ["Frappe sur le Palais présidentiel."], "narr"),
]
TITLE_START = LAST_RENDER / FPS


def fade(t, t0, t1, fin=0.4, fout=0.4):
    if t < t0 or t > t1:
        return 0.0
    return max(0.0, min(1.0, min((t - t0) / fin, (t1 - t) / fout)))


def grade(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    lum = a.mean(2, keepdims=True)
    a = a * (np.array([0.93, 0.99, 1.08], np.float32) * (1 - lum) + np.array([1.07, 1.0, 0.86], np.float32) * lum)
    a = np.clip((a - 0.5) * 1.12 + 0.5, 0, 1)
    g = a.mean(2, keepdims=True); a = np.clip(g + (a - g) * 1.12, 0, 1)
    bright = np.clip((a - 0.72) / 0.28, 0, 1)
    bl = Image.fromarray((bright * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(22))
    a = np.clip(a + np.asarray(bl).astype(np.float32) / 255.0 * 0.34 * np.array([1.0, 0.9, 0.7], np.float32), 0, 1)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    a *= (1 - 0.34 * np.clip(r - 0.45, 0, 1) ** 1.6)[..., None]
    a += rng.normal(0, 0.012, a.shape[:2])[..., None].astype(np.float32)             # grain de pellicule léger
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def text_layer(lines, alpha, style, t):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    if alpha <= 0:
        return lay
    A = lambda v: int(v * alpha)
    if style == "narr":
        big = ImageFont.truetype(F_NARR, 38); small = ImageFont.truetype(F_TITLE, 22)
        y = H - BAR - 40 - sum(46 if not (ln.isupper() and len(lines) > 1 and i == 0) else 30 for i, ln in enumerate(lines)) - 10
        for i, ln in enumerate(lines):
            head = ln.isupper() and len(lines) > 1 and i == 0
            f = small if head else big
            txt = " ".join(ln) if head else ln
            x = (W - d.textlength(txt, font=f)) / 2
            d.text((x + 2, y + 2), txt, font=f, fill=(0, 0, 0, A(190)))
            d.text((x, y), txt, font=f, fill=(255, 190, 110, A(255)) if head else (255, 238, 212, A(255)))
            y += 30 if head else 46
    elif style == "comm":                                          # communiqué d'Artex : texte blanc sur voile noir, façon télex
        f = ImageFont.truetype(F_TITLE, 34); n = len(lines)
        ph = n * 48 + 36; y0 = H / 2 - ph / 2 + 40
        d.rectangle([W * 0.12, y0 - 14, W * 0.88, y0 + ph - 14], fill=(0, 0, 0, A(170)))
        d.rectangle([W * 0.12, y0 - 14, W * 0.12 + 6, y0 + ph - 14], fill=(235, 235, 235, A(255)))
        for i, ln in enumerate(lines):
            x = W * 0.12 + 30
            d.text((x, y0 + 8 + i * 48), ln, font=f, fill=(245, 245, 240, A(255)))
    elif style == "tv":                                            # journal télévisé : bandeau rouge et texte blanc en bas
        tag = ImageFont.truetype(F_TITLE, 24); f = ImageFont.truetype(F_TITLE, 30)
        n = len(lines) - 1
        y0 = H - BAR - 30 - (n * 40 + 52)
        d.rectangle([60, y0, W - 60, y0 + n * 40 + 52], fill=(8, 12, 20, A(205)))
        d.rectangle([60, y0, 60 + 8, y0 + n * 40 + 52], fill=(220, 30, 30, A(255)))
        d.rectangle([60 + 20, y0 + 10, 60 + 20 + d.textlength(lines[0], font=tag) + 20, y0 + 10 + 30], fill=(200, 25, 25, A(255)))
        d.text((60 + 30, y0 + 12), lines[0], font=tag, fill=(255, 255, 255, A(255)))
        for i, ln in enumerate(lines[1:]):
            d.text((60 + 24, y0 + 48 + i * 40), ln, font=f, fill=(240, 244, 250, A(255)))
    elif style == "shout":                                         # cri du soldat : grosses lettres rouges qui tremblent
        f = ImageFont.truetype(F_SHOUT, 70)
        txt = lines[0]; jx = int(4 * np.sin(t * 40)); jy = int(3 * np.sin(t * 53 + 1))
        x = (W - d.textlength(txt, font=f)) / 2 + jx; y = H - BAR - 150 + jy
        d.text((x + 4, y + 4), txt, font=f, fill=(0, 0, 0, A(220)))
        d.text((x, y), txt, font=f, fill=(255, 60, 40, A(255)))
    return lay


def logo():
    im = Image.open(os.path.join(BASE, "..", "intro", "drapeau_artex.png")).convert("L")
    im = im.resize((260, int(260 * im.height / im.width)), Image.LANCZOS)
    rgba = Image.new("RGBA", im.size, (255, 244, 225, 0)); rgba.putalpha(im)          # blanc du renard = opaque, noir = transparent
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
    os.makedirs(POST, exist_ok=True)
    for f in os.listdir(POST):
        if f.endswith(".png"):
            os.remove(os.path.join(POST, f))
    mark = logo()
    last = grade(Image.open(os.path.join(FR, f"f_{LAST_RENDER:04d}.png")).convert("RGB").resize((W, H), Image.LANCZOS))
    for n in range(1, TOTAL + 1):
        t = (n - 1) / FPS
        if n <= LAST_RENDER:
            img = grade(Image.open(os.path.join(FR, f"f_{n:04d}.png")).convert("RGB").resize((W, H), Image.LANCZOS))
            fl = FLASH.get(n, 0.0)
            if fl > 0:                                              # éclair blanc d'explosion
                a = np.asarray(img).astype(np.float32); a = a + (255 - a) * min(1.0, fl) * 0.85
                img = Image.fromarray(a.astype(np.uint8))
            rgba = img.convert("RGBA")
            for t0, t1, lines, style in CARDS:
                al = fade(t, t0, t1)
                if al > 0:
                    rgba = Image.alpha_composite(rgba, text_layer(lines, al, style, t))
            img = rgba.convert("RGB")
        else:
            img = title_card(last.copy(), t, mark)
        d = ImageDraw.Draw(img); d.rectangle([0, 0, W, BAR], fill=(0, 0, 0)); d.rectangle([0, H - BAR, W, H], fill=(0, 0, 0))
        k = min(1.0, t / 0.6, (TOTAL / FPS - t) / 0.45 if t > TOTAL / FPS - 0.45 else 1.0)
        if k < 1.0:
            img = Image.fromarray((np.asarray(img).astype(np.float32) * k).astype(np.uint8))
        img.save(os.path.join(POST, f"p_{n:04d}.png"))
        if n % 120 == 0:
            print("image", n, flush=True)
    if "--no-encode" in sys.argv:
        return
    cmd = [FFMPEG, "-y", "-framerate", str(FPS), "-i", os.path.join(POST, "p_%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "slow", "-movflags", "+faststart", MP4]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stderr[-400:] if r.returncode else f"MP4 : {MP4} ({os.path.getsize(MP4) / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()
