"""Genera las ilustraciones SVG, los iconos PWA y el video de Brote.
Uso (desde la carpeta brote):  python3 herramientas/generar-recursos.py
Requiere: cairosvg, Pillow y ffmpeg."""
import subprocess, pathlib
import cairosvg
from PIL import Image, ImageDraw, ImageFont

RAIZ = pathlib.Path(__file__).resolve().parent.parent / "public"
IMG, MEDIA, TMP = RAIZ / "img", RAIZ / "media", pathlib.Path("/tmp/brote")
TMP.mkdir(exist_ok=True)
MUSGO, HOJA, BROTE, ARCILLA, SALVIA = "#15352a", "#2f7d4f", "#b9dd5a", "#c4703f", "#e7efe0"
VERDES = [HOJA, "#6fb56f", BROTE]

def hoja(x, y, ang, s, c):
    return (f'<path transform="translate({x:.0f} {y:.0f}) rotate({ang}) scale({s})" '
            f'd="M0 0C28-18 34-58 0-92-34-58-28-18 0 0Z" fill="{c}"/>')

def punto(t, dx, h):  # punto de la curva del tallo
    x = 640 + 2 * (1 - t) * t * dx * .2 + t * t * dx
    y = 506 - (2 * (1 - t) * t * h * .55 + t * t * h)
    return x, y

def tallo(dx, h, hojas, punta):
    s = f'<path d="M640 506Q{640 + dx * .2:.0f} {506 - h * .55:.0f} {640 + dx} {506 - h}" stroke="{HOJA}" stroke-width="7" fill="none" stroke-linecap="round"/>'
    for i, (t, e) in enumerate(hojas):
        x, y = punto(t, dx, h)
        c = VERDES[i % 3]
        s += hoja(x, y, 58, e, c) + hoja(x, y, -58, e, VERDES[(i + 1) % 3])
    x, y = punto(1, dx, h)
    return s + (hoja(x, y, dx / 12, punta, BROTE) if punta else "")

ETAPAS = [
    ([], "Día 0 · Siembra"),
    ([(0, 70, [(1, .42)], 0)], "Día 3 · Germinación"),
    ([(0, 150, [(.5, .6), (1, .7)], .7)], "Día 7 · Primeras hojas"),
    ([(-80, 190, [(.4, .65), (.7, .7), (1, .75)], .8), (0, 250, [(.35, .75), (.65, .85), (1, .9)], 1),
      (85, 205, [(.45, .7), (.75, .8), (1, .8)], .85)], "Día 14 · Primera cosecha"),
]

def escena(contenido):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">'
            f'<rect width="1280" height="720" fill="{SALVIA}"/><circle cx="640" cy="330" r="290" fill="#f4f8ef"/>'
            f'<rect y="640" width="1280" height="80" fill="#cfdcc3"/>{contenido}</svg>')

MACETA = (f'<path d="M520 520H760L738 640Q736 652 724 652H556Q544 652 542 640Z" fill="{ARCILLA}"/>'
          f'<rect x="505" y="496" width="270" height="34" rx="10" fill="#d98a57"/>'
          f'<ellipse cx="640" cy="506" rx="124" ry="9" fill="#5b3a29"/>')

for i, (tallos, _) in enumerate(ETAPAS):
    semillas = "".join(f'<ellipse cx="{x}" cy="{503 + y}" rx="8" ry="4.5" fill="#e9d9a6" transform="rotate({a} {x} {503 + y})"/>'
                       for x, y, a in [(590, 0, 20), (625, 3, -15), (660, 0, 35), (695, 3, 0), (610, -3, -30)]) if i == 0 else ""
    cuerpo = MACETA + semillas + "".join(tallo(*t) for t in tallos)
    (IMG / f"etapa-{i}.svg").write_text(escena(cuerpo), encoding="utf-8")

kit = (f'<g transform="translate(-200 0) scale(1)">{MACETA}</g>'
       f'<rect x="700" y="420" width="150" height="210" rx="10" fill="#fff" stroke="{HOJA}" stroke-width="5"/>'
       f'<path d="M775 500c-40 0-46-34-46-34s38-4 46 34zM775 500c40 0 46-34 46-34s-38-4-46 34z" fill="{BROTE}"/>'
       f'<rect x="725" y="530" width="100" height="10" rx="5" fill="{HOJA}"/><rect x="740" y="554" width="70" height="10" rx="5" fill="#9fc5a8"/>'
       f'<path d="M890 470h170q10 0 10 10v150H880V480q0-10 10-10z" fill="#5b3a29"/><rect x="900" y="520" width="150" height="56" rx="8" fill="{SALVIA}"/>'
       f'<rect x="915" y="540" width="100" height="10" rx="5" fill="{ARCILLA}"/>'
       f'<rect x="1090" y="450" width="140" height="180" rx="8" fill="{MUSGO}"/>'
       f'<rect x="1112" y="480" width="96" height="12" rx="6" fill="{BROTE}"/>'
       + "".join(f'<rect x="1112" y="{512 + k * 24}" width="{96 - k * 14}" height="8" rx="4" fill="#9fc5a8"/>' for k in range(4)))
(IMG / "kit.svg").write_text(escena(kit.replace("translate(-200 0)", "translate(-420 0)")), encoding="utf-8")

def logo(rx):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="{rx}" fill="{MUSGO}"/>'
            f'<path d="M256 380V250" stroke="{BROTE}" stroke-width="22" stroke-linecap="round"/>'
            f'<path d="M256 270c-74 0-92-66-92-66s82-10 92 66z" fill="{HOJA}"/>'
            f'<path d="M256 240c68 0 88-74 88-74s-80-6-88 74z" fill="{BROTE}"/></svg>')
(IMG / "logo.svg").write_text(logo(112), encoding="utf-8")
(TMP / "icono.svg").write_text(logo(0), encoding="utf-8")
for n in (192, 512):
    cairosvg.svg2png(url=str(TMP / "icono.svg"), write_to=str(IMG.parent / "icons" / f"icon-{n}.png"), output_width=n, output_height=n)

# ---- Video: portada + 4 etapas + cierre ----
def fuente(px):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
        if pathlib.Path(f).exists():
            return ImageFont.truetype(f, px)
    return ImageFont.load_default(px)

def texto(img, xy, t, px, color, centro=False):
    d, f = ImageDraw.Draw(img), fuente(px)
    if centro:
        xy = ((1280 - d.textlength(t, font=f)) / 2, xy[1])
    d.text(xy, t, font=f, fill=color)

cuadros = []
for k in range(6):
    p = TMP / f"c{k}.png"
    if 1 <= k <= 4:
        cairosvg.svg2png(url=str(IMG / f"etapa-{k - 1}.svg"), write_to=str(p), output_width=1280, output_height=720)
        im = Image.open(p).convert("RGB")
        ImageDraw.Draw(im).rounded_rectangle((60, 40, 60 + 40 * len(ETAPAS[k - 1][1]) // 1.6, 120), 40, fill=MUSGO)
        texto(im, (92, 55), ETAPAS[k - 1][1], 34, BROTE)
    else:
        im = Image.new("RGB", (1280, 720), MUSGO)
        texto(im, (0, 250), "Brote" if k == 0 else "Tu huerto empieza hoy", 96, BROTE, True)
        texto(im, (0, 400), "Microhuerto para tu cocina" if k == 0 else "brote.mx", 36, "#e7efe0", True)
    im.save(p)
    cuadros.append(p)

Image.open(cuadros[4]).save(MEDIA / "poster.jpg", quality=85)
entradas = sum([["-loop", "1", "-t", "3", "-i", str(c)] for c in cuadros], [])
filtro, previo = "", "[0]"
for k in range(1, 6):
    filtro += f"{previo}[{k}]xfade=transition=fade:duration=0.6:offset={k * 2.4:.1f}[v{k}];"
    previo = f"[v{k}]"
subprocess.run(["ffmpeg", "-y", *entradas, "-filter_complex", filtro.rstrip(";"), "-map", previo, "-r", "30",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(MEDIA / "brote.mp4")],
               check=True, capture_output=True)
print("Recursos generados en public/img, public/icons y public/media")
