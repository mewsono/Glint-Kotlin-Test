"""Generate Pinboard PWA icons: red (#E60023) tile + bold white P."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).parent / "icons"
OUT.mkdir(exist_ok=True)
RED = (230, 0, 35, 255)
WHITE = (255, 255, 255, 255)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SS = 4  # supersample

def make(size, filename, *, full_bleed=False, letter_scale=0.62):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if full_bleed:
        d.rectangle([0, 0, s, s], fill=RED)
    else:
        d.rounded_rectangle([0, 0, s-1, s-1], radius=int(s*0.225), fill=RED)
    # letter P centered (optical: nudge up slightly)
    font = ImageFont.truetype(FONT, int(s * letter_scale))
    bbox = d.textbbox((0, 0), "P", font=font)
    w, h = bbox[2]-bbox[0], bbox[3]-bbox[1]
    x = (s - w) / 2 - bbox[0]
    y = (s - h) / 2 - bbox[1] - int(s*0.02)
    d.text((x, y), "P", font=font, fill=WHITE)
    # tiny pin dot at foot of the P stem — subtle brand touch
    img = img.resize((size, size), Image.LANCZOS)
    # apple icons must not have alpha
    if full_bleed and filename == "apple-touch-icon.png":
        bg = Image.new("RGB", (size, size), RED[:3])
        bg.paste(img, (0,0), img)
        bg.save(OUT / filename)
    else:
        img.save(OUT / filename)
    print(filename, size)

make(192, "icon-192.png")
make(512, "icon-512.png")
make(512, "maskable-512.png", full_bleed=True, letter_scale=0.46)  # safe zone
make(180, "apple-touch-icon.png", full_bleed=True, letter_scale=0.58)
make(64,  "favicon-64.png")
print("done")
