"""Finition de l'intro de Sahel Game : étalonnage chaud, lueur, vignette, bandes de cinéma, cartons de texte en français, titre final, fondus,
puis encodage en MP4 avec ffmpeg. Entrée : assets/intro/frames/f_0001..f_0396.png (rendus par s40_intro.py). Sortie : assets/intro/post/ et le MP4.
Usage : python -I tools/blender/intro_post.py [--no-encode]"""
import os, sys, subprocess, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
FR = os.path.join(PROJ, "assets", "intro", "frames")
POST = os.path.join(PROJ, "assets", "intro", "post")
MP4 = os.path.join(PROJ, "assets", "intro", "Sahel_Game_Intro.mp4")
FFMPEG = shutil.which("ffmpeg") or r"C:\Users\Kabakoo Apprenant.e\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
W, H, FPS = 1280, 720, 24
LAST_RENDER, TOTAL = 396, 480
BAR = int(H - W / 2.39) // 2                                    # bandes noires : format cinéma 2,39:1
FONT_NARR = r"C:\Windows\Fonts\georgiai.ttf"                    # Georgia italique pour la narration
FONT_TITLE = r"C:\Windows\Fonts\bahnschrift.ttf"                # Bahnschrift pour le titre

# cartons : (début s, fin s, [lignes], style)
CARDS = [
    (0.6, 3.2, ["NORD DU MALI", "L'aube se lève sur le désert."], "narr"),
    (3.3, 5.9, ["Un convoi vient de tomber", "dans une embuscade."], "narr"),
    (6.3, 9.3, ["Personne d'autre", "ne peut arriver à temps."], "narr"),
    (14.2, 16.4, ["Le Sahel ne pardonne pas."], "narr"),
]
TITLE_START = LAST_RENDER / FPS                                 # 16,5 s : le titre arrive sur le dernier plan assombri


def grade(img):
    """Étalonnage : chaud dans les hautes lumières, légèrement froid dans les ombres, contraste doux, lueur et vignette."""
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    lum = a.mean(2, keepdims=True)
    warm = np.array([1.07, 1.0, 0.86], np.float32); cool = np.array([0.93, 0.99, 1.08], np.float32)
    a = a * (cool * (1 - lum) + warm * lum)
    a = np.clip((a - 0.5) * 1.1 + 0.5, 0, 1)                    # contraste
    g = a.mean(2, keepdims=True); a = np.clip(g + (a - g) * 1.12, 0, 1)   # saturation
    # lueur (bloom) : les hautes lumières floutées s'ajoutent
    bright = np.clip((a - 0.72) / 0.28, 0, 1)
    bl = Image.fromarray((bright * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(22))
    a = np.clip(a + np.asarray(bl).astype(np.float32) / 255.0 * 0.32 * np.array([1.0, 0.9, 0.7], np.float32), 0, 1)
    # vignette
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    a *= (1 - 0.32 * np.clip(r - 0.45, 0, 1) ** 1.6)[..., None]
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def fade(t, t0, t1, fin=0.5, fout=0.5):
    """Opacité 0..1 d'un élément visible de t0 à t1, avec fondus d'entrée et de sortie."""
    if t < t0 or t > t1:
        return 0.0
    return max(0.0, min(1.0, min((t - t0) / fin, (t1 - t) / fout)))


def draw_text(img, lines, alpha, style):
    if alpha <= 0:
        return img
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    if style == "narr":
        big = ImageFont.truetype(FONT_NARR, 38); small = ImageFont.truetype(FONT_TITLE, 22)
        y = H - BAR - 40 - sum(46 if i else 30 for i, _ in enumerate(lines)) - 10
        for i, ln in enumerate(lines):
            f = small if ln.isupper() and len(lines) > 1 and i == 0 else big
            txt = (" ".join(ln) if f is small else ln)                       # le lieu en petites capitales espacées
            tw = d.textlength(txt, font=f)
            x = (W - tw) / 2
            d.text((x + 2, y + 2), txt, font=f, fill=(0, 0, 0, int(190 * alpha)))
            d.text((x, y), txt, font=f, fill=(255, 238, 212, int(255 * alpha)) if f is big else (255, 190, 110, int(255 * alpha)))
            y += 46 if f is big else 30
    return Image.alpha_composite(img.convert("RGBA"), lay).convert("RGB")


def bars(img):
    d = ImageDraw.Draw(img); d.rectangle([0, 0, W, BAR], fill=(0, 0, 0)); d.rectangle([0, H - BAR, W, H], fill=(0, 0, 0))
    return img


def title_card(img, t):
    """Titre final sur le dernier plan assombri, avec un lent avancement ; fondu au noir à la fin."""
    u = (t - TITLE_START) / (TOTAL / FPS - TITLE_START)             # 0..1 sur le dernier plan
    zoom = 1.0 + 0.06 * u
    cw, ch = int(W / zoom), int(H / zoom)
    img = img.crop(((W - cw) // 2, (H - ch) // 2, (W + cw) // 2, (H + ch) // 2)).resize((W, H), Image.LANCZOS)
    dark = min(0.72, u * 2.2 * 0.72)
    a = np.asarray(img).astype(np.float32) * (1 - dark)
    img = Image.fromarray(a.astype(np.uint8))
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    al = fade(t, TITLE_START + 0.5, TOTAL / FPS - 0.45, 0.8, 0.45)
    tf = ImageFont.truetype(FONT_TITLE, 118); sf = ImageFont.truetype(FONT_NARR, 30)
    title = "SAHEL GAME"; track = 14
    tw = sum(d.textlength(c, font=tf) for c in title) + track * (len(title) - 1)
    x = (W - tw) / 2; y = H / 2 - 82
    for c in title:
        d.text((x + 3, y + 4), c, font=tf, fill=(0, 0, 0, int(200 * al)))
        d.text((x, y), c, font=tf, fill=(255, 226, 170, int(255 * al)))
        x += d.textlength(c, font=tf) + track
    al2 = fade(t, TITLE_START + 1.5, TOTAL / FPS - 0.45, 0.8, 0.45)
    sub = "Survivre.  Protéger.  Tenir le Sahel."
    sw = d.textlength(sub, font=sf)
    d.line([(W / 2 - 120, H / 2 + 62), (W / 2 + 120, H / 2 + 62)], fill=(255, 190, 110, int(160 * al2)), width=2)
    d.text(((W - sw) / 2 + 2, H / 2 + 84), sub, font=sf, fill=(0, 0, 0, int(190 * al2)))
    d.text(((W - sw) / 2, H / 2 + 82), sub, font=sf, fill=(255, 238, 212, int(255 * al2)))
    return Image.alpha_composite(img.convert("RGBA"), lay).convert("RGB")


def main():
    os.makedirs(POST, exist_ok=True)
    for f in os.listdir(POST):
        if f.endswith(".png"):
            os.remove(os.path.join(POST, f))
    last = grade(Image.open(os.path.join(FR, f"f_{LAST_RENDER:04d}.png")).convert("RGB").resize((W, H), Image.LANCZOS))
    for n in range(1, TOTAL + 1):
        t = (n - 1) / FPS
        if n <= LAST_RENDER:
            img = grade(Image.open(os.path.join(FR, f"f_{n:04d}.png")).convert("RGB").resize((W, H), Image.LANCZOS))
            for t0, t1, lines, style in CARDS:
                img = draw_text(img, lines, fade(t, t0, t1), style)
        else:
            img = title_card(last.copy(), t)
        img = bars(img)
        fi = min(1.0, t / 0.6)                                       # fondu d'ouverture depuis le noir
        fo = min(1.0, (TOTAL / FPS - t) / 0.45) if t > TOTAL / FPS - 0.45 else 1.0       # fondu de fermeture au noir
        k = min(fi, fo)
        if k < 1.0:
            img = Image.fromarray((np.asarray(img).astype(np.float32) * k).astype(np.uint8))
        img.save(os.path.join(POST, f"p_{n:04d}.png"))
        if n % 80 == 0:
            print("image", n, flush=True)
    if "--no-encode" in sys.argv:
        return
    cmd = [FFMPEG, "-y", "-framerate", str(FPS), "-i", os.path.join(POST, "p_%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
           "-preset", "slow", "-movflags", "+faststart", MP4]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stderr[-400:] if r.returncode else f"MP4 : {MP4} ({os.path.getsize(MP4) / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()
