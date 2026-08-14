#!/usr/bin/env python3
"""Create the selectable-text USA Map Studio install and user guide."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "USA-Map-Studio-User-Guide.pdf"
SCREENSHOT = ROOT / "docs" / "assets" / "usa-map-studio-overview.png"
PAGE_W, PAGE_H = letter

GREEN = HexColor("#00662C")
NAVY = HexColor("#00454D")
DARK = HexColor("#373A36")
ENERGY = HexColor("#7DBA00")
MIST = HexColor("#8BFEBF")
BIOME = HexColor("#00B38F")
AQUA = HexColor("#00BDB5")
BLUE = HexColor("#006BA6")
HYDRO = HexColor("#005776")
FORGE = HexColor("#FF9E1B")
SPARK = HexColor("#FE5000")
PLASMA = HexColor("#B50094")
PULSAR = HexColor("#4E008E")
GRAPHITE = HexColor("#DBDCDB")
SOFT_GREEN = HexColor("#EAF4EC")
SOFT_NAVY = HexColor("#E8F0F1")
PALE = HexColor("#F3F6F4")
BORDER = HexColor("#C8D3CE")
WHITE = white


def wrapped(pdf, text, x, y, width, font="Helvetica", size=9, leading=12, color=DARK):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    line = ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if line and stringWidth(candidate, font, size) > width:
            pdf.drawString(x, y, line)
            y -= leading
            line = word
        else:
            line = candidate
    if line:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def label(pdf, text, x, y, color=GREEN):
    pdf.setFillColor(color)
    pdf.setFont("Helvetica-Bold", 8.2)
    pdf.drawString(x, y, text.upper())


def linked_text(pdf, prefix, url, x, y):
    pdf.setFillColor(DARK)
    pdf.setFont("Helvetica-Bold", 7.8)
    pdf.drawString(x, y, prefix)
    prefix_width = stringWidth(prefix, "Helvetica-Bold", 7.8)
    link_x = x + prefix_width + 4
    pdf.setFillColor(BLUE)
    pdf.setFont("Helvetica-Bold", 7.8)
    pdf.drawString(link_x, y, url)
    link_width = stringWidth(url, "Helvetica-Bold", 7.8)
    pdf.linkURL(url, (link_x, y - 2, link_x + link_width, y + 9), relative=0)


def page_header(pdf, eyebrow, title, subtitle, page_number):
    pdf.setFillColor(GREEN)
    pdf.rect(0, PAGE_H - 142, PAGE_W, 142, stroke=0, fill=1)
    pdf.setFillColor(NAVY)
    pdf.rect(PAGE_W - 18, PAGE_H - 142, 18, 142, stroke=0, fill=1)
    pdf.setFillColor(ENERGY)
    pdf.rect(0, PAGE_H - 148, PAGE_W, 6, stroke=0, fill=1)
    label(pdf, eyebrow, 40, 758, WHITE)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 26)
    pdf.drawString(40, 717, title)
    pdf.setFont("Helvetica", 10.2)
    pdf.drawString(40, 690, subtitle)
    pdf.setFont("Helvetica-Bold", 31)
    pdf.drawRightString(570, 697, f"0{page_number}")


def footer(pdf, page_number):
    pdf.setFillColor(DARK)
    pdf.rect(0, 0, PAGE_W, 48, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica", 7.2)
    pdf.drawString(40, 28, "USA Map Studio v0.6.0 | Local desktop quick start | August 14, 2026")
    pdf.drawRightString(572, 28, f"PAGE {page_number} OF 6")


def code_box(pdf, title, lines, x, y, width, height, accent):
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(BORDER)
    pdf.rect(x, y, width, height, stroke=1, fill=1)
    pdf.setFillColor(accent)
    pdf.rect(x, y + height - 30, width, 30, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(x + 13, y + height - 20, title)
    pdf.setFillColor(DARK)
    pdf.setFont("Courier", 6.6)
    cursor = y + height - 48
    for line in lines:
        pdf.drawString(x + 13, cursor, line)
        cursor -= 12


def step_card(pdf, number, title, body, x, y, width, height, fill=SOFT_GREEN, accent=GREEN):
    pdf.setFillColor(fill)
    pdf.rect(x, y, width, height, stroke=0, fill=1)
    pdf.setFillColor(accent)
    pdf.rect(x, y, 5, height, stroke=0, fill=1)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(x + 14, y + height - 21, f"{number}  {title}")
    wrapped(pdf, body, x + 14, y + height - 39, width - 28, size=7.7, leading=10.4)


def bullet(pdf, title, body, x, y, width, accent=GREEN):
    pdf.setFillColor(accent)
    pdf.circle(x + 5, y - 2, 3, stroke=0, fill=1)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 8.7)
    pdf.drawString(x + 16, y, title)
    return wrapped(pdf, body, x + 16, y - 15, width - 16, size=8.1, leading=10.8)


def palette_row(pdf, title, entries, x, y, width):
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(BORDER)
    pdf.rect(x, y, width, 74, stroke=1, fill=1)
    label(pdf, title, x + 12, y + 55)
    cell_width = (width - 24) / len(entries)
    for index, (name, value, color) in enumerate(entries):
        cell_x = x + 12 + index * cell_width
        pdf.setFillColor(color)
        pdf.setStrokeColor(DARK if value in ("#FFFFFF", "#DBDCDB") else color)
        pdf.rect(cell_x, y + 22, 20, 20, stroke=1, fill=1)
        pdf.setFillColor(NAVY)
        pdf.setFont("Helvetica-Bold", 5.8)
        pdf.drawString(cell_x + 25, y + 34, name)
        pdf.setFillColor(DARK)
        pdf.setFont("Courier", 5.5)
        pdf.drawString(cell_x + 25, y + 24, value)


def build_pdf(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=letter, pageCompression=1)
    pdf.setTitle("USA Map Studio User Guide")
    pdf.setAuthor("USA Map Studio")
    pdf.setSubject("macOS and Windows setup, multi-row label callouts, saved canvas navigation, map layers, CSV import, custom SVG pins, ORNL color swatches, exports, and local MCP control")

    page_header(pdf, "No signed installer required | macOS and Windows", "Install from source.", "One verified script prepares, builds, checks, and starts the local desktop app.", 1)
    label(pdf, "Before you begin", 40, 614)
    wrapped(pdf, "Use macOS 12 or later, or Windows 10/11, with Git and internet access during first setup. Run Terminal or PowerShell as a normal user. Setup uses an existing compatible Node.js runtime or downloads a private pinned copy.", 40, 595, 532, size=8.7, leading=11.8)
    linked_text(pdf, "Public source:", "https://github.com/adammalin/Map-Maker-Studio", 40, 554)
    code_box(pdf, "Mac - Terminal", [
        "git clone https://github.com/adammalin/Map-Maker-Studio.git \\",
        "  \"$HOME/Map-Maker-Studio\"",
        "cd \"$HOME/Map-Maker-Studio\"",
        "/bin/zsh scripts/setup-macos.zsh",
    ], 40, 398, 532, 142, GREEN)
    code_box(pdf, "Windows - PowerShell", [
        "git clone https://github.com/adammalin/Map-Maker-Studio.git `",
        "  \"$env:USERPROFILE\\Map-Maker-Studio\"",
        "Set-Location \"$env:USERPROFILE\\Map-Maker-Studio\"",
        "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `",
        "  -File \".\\scripts\\setup-windows.ps1\"",
    ], 40, 202, 532, 168, NAVY)
    pdf.setFillColor(SOFT_GREEN)
    pdf.rect(40, 57, 532, 116, stroke=0, fill=1)
    label(pdf, "Relaunch or update", 56, 151)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 7.2)
    pdf.drawString(56, 133, "Mac relaunch")
    pdf.setFillColor(DARK)
    pdf.setFont("Courier", 6.7)
    pdf.drawString(126, 133, "/bin/zsh \"$HOME/Map-Maker-Studio/Start-USA-Map-Studio.command\"")
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 7.2)
    pdf.drawString(56, 117, "Windows relaunch")
    pdf.setFillColor(DARK)
    pdf.setFont("Courier", 6.7)
    pdf.drawString(145, 117, "& \"$env:USERPROFILE\\Map-Maker-Studio\\Start-USA-Map-Studio.cmd\"")
    wrapped(pdf, "To update, close the app and rerun the setup command above. A clean main checkout safely pulls the latest release before rebuilding and testing. Setup creates no DMG, PKG, MSI, or EXE installer and makes no system-wide changes.", 56, 96, 500, size=7.2, leading=9.3)
    footer(pdf, 1)
    pdf.showPage()

    page_header(pdf, "Workspace overview | accurate local geography", "Build the map visually.", "A focused canvas, named layers, location list, and inspector keep every change visible.", 2)
    if SCREENSHOT.exists():
        image = ImageReader(str(SCREENSHOT))
        pdf.drawImage(image, 40, 314, width=532, height=320, preserveAspectRatio=True, anchor="c", mask="auto")
        pdf.setStrokeColor(BORDER)
        pdf.rect(40, 314, 532, 320, stroke=1, fill=0)
    step_card(pdf, "1", "MAP EDITOR", "Select pins, drag multi-row callouts, arrange labels, and review leader lines on the largest canvas.", 40, 190, 120, 96)
    step_card(pdf, "2", "LOCATIONS", "Choose All pins or This pin; add City, Company, and custom label rows; then style each row.", 174, 190, 120, 96, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "LAYERS", "Name, reorder, show, hide, and count separate location groups. Set one shared pin style.", 308, 190, 120, 96, PALE, BLUE)
    step_card(pdf, "4", "MAP STYLE", "Control fills, boundaries, county lines, label halo, abbreviations, and legend.", 442, 190, 130, 96, SOFT_GREEN, GREEN)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 77, 532, 86, stroke=0, fill=1)
    label(pdf, "Map controls and shortcuts", 56, 139, ENERGY)
    wrapped(pdf, "Hold Space and drag anywhere to pan; drag a pin without Space to move it. Drag a callout to place all its label rows and create an automatic leader line; dragging locks it. Scroll at the pointer or use -/+ to zoom; 0 Fits and 1 returns to 100%. Zoom and pan autosave in the project and return on relaunch. Project keys: Cmd/Ctrl+S Save, Cmd/Ctrl+O Open, Cmd/Ctrl+N New, Cmd/Ctrl+Z Undo, / Search, and ? Shortcuts.", 56, 119, 500, font="Helvetica-Bold", size=7.35, leading=9.65, color=WHITE)
    footer(pdf, 2)
    pdf.showPage()

    page_header(pdf, "CSV intake and complete projects", "Import data. Keep it whole.", "Flexible columns feed a versioned project file that can be saved and reopened.", 3)
    label(pdf, "Minimum CSV", 40, 614)
    code_box(pdf, "Two columns are enough", ["city,state", "Oak Ridge,TN", "Seattle,WA"], 40, 508, 254, 82, GREEN)
    code_box(pdf, "Add company labels", ["city,state,company", "Denver,CO,Front Range Components"], 318, 508, 254, 82, NAVY)
    label(pdf, "Optional visual fields", 40, 478)
    y = bullet(pdf, "Multiple label rows", "company adds a Company row; label_2, label_3, and custom_label_1 add ordered Custom rows beneath the City row.", 40, 456, 250)
    y = bullet(pdf, "Pins", "All pins is the default editing scope. Switch to This pin for one location. Type, color, size, and custom SVG choices follow that scope.", 40, y - 5, 250, BLUE)
    bullet(pdf, "Visibility and data", "visible hides the complete location; show_label hides its callout. Notes and unknown columns remain in project JSON.", 40, y - 58, 250, FORGE)
    y2 = bullet(pdf, "Choose the target layer", "The import summary separates ready rows from issues. Choose a named layer, then Add or Replace target layer. Other layers are untouched.", 318, 456, 254)
    y2 = bullet(pdf, "Save and autosave", "Save project chooses a .usmap.json path. Every later project change atomically updates that file and an internal recovery JSON.", 318, y2 - 5, 254, BLUE)
    bullet(pdf, "Open project", "Schema 5 stores the export viewport plus every label row, font, size, position, lock, and leader line. Versions 1-4 migrate safely when opened.", 318, y2 - 58, 254, FORGE)
    pdf.setFillColor(SOFT_GREEN)
    pdf.rect(40, 77, 532, 116, stroke=0, fill=1)
    label(pdf, "Coordinate rule", 56, 168)
    wrapped(pdf, "When latitude and longitude are blank, the app matches city and state to one of 32,350 representative points from the 2025 U.S. Census National Places Gazetteer. If both coordinates are supplied, the app preserves them. An unresolved place stays out of the map and appears in the import issue list so it cannot be plotted silently at the wrong location.", 56, 147, 500, size=8.4, leading=11.4)
    footer(pdf, 3)
    pdf.showPage()

    page_header(pdf, "Publish and recover | local-first workflow", "Export editable slide objects.", "SVG, PNG, PowerPoint, and project JSON share one composition.", 4)
    step_card(pdf, "1", "SVG", "Scalable vector artwork with a named group for each visible location layer.", 40, 516, 120, 92)
    step_card(pdf, "2", "PNG", "A 2400 x 1440 raster image for documents, email, and quick review.", 174, 516, 120, 92, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "PPTX", "Editable states, separate label text boxes, leader lines, pins, and legend.", 308, 516, 120, 92, PALE, BLUE)
    step_card(pdf, "4", "JSON", "The complete project: export viewport, label formatting and placement, layers, data, and embedded pin artwork.", 442, 516, 130, 92, SOFT_GREEN, GREEN)
    label(pdf, "Good working sequence", 40, 478)
    bullet(pdf, "1  Save the project once", "Choose a .usmap.json path. Later project edits autosave to that file; a recovery JSON is restored on relaunch.", 40, 456, 532)
    bullet(pdf, "2  Arrange and review labels", "Run Arrange labels, inspect the warning badge, then drag and lock exceptions. Exports reuse these saved positions.", 40, 402, 532, BLUE)
    bullet(pdf, "3  Keep source and output together", "Store the CSV and project JSON beside exported artwork when the map must be reproduced later.", 40, 348, 532, FORGE)
    label(pdf, "Troubleshooting", 40, 292)
    wrapped(pdf, "Setup fails: rerun the setup script; it repairs dependencies and rebuilds safely. A city is unresolved: add exact coordinates or use the official Census place name. Label layout issue: run Arrange labels; if one remains, drag its callout or use an edge rail and leader line. To let Arrange move a manual callout again, unlock it first. Autosave fails: keep the app open, check the status chip, and use Save project to choose a writable location.", 40, 273, 532, size=8.35, leading=11.2)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 77, 532, 118, stroke=0, fill=1)
    label(pdf, "Local data boundary", 56, 171, ENERGY)
    wrapped(pdf, "Normal editing, place lookup, map rendering, and export run locally. USA Map Studio does not send CSV or project content to a service. Files are written only to locations you choose. The bundled map and place data come from U.S. Census Bureau 2025 Cartographic Boundary and Gazetteer files.", 56, 149, 500, font="Helvetica-Bold", size=8.4, leading=11.6, color=WHITE)
    footer(pdf, 4)
    pdf.showPage()

    page_header(pdf, "Optional local integration | Model Context Protocol", "Let AI prepare. You decide.", "ChatGPT desktop, Codex, and compatible local clients can stage map changes for review.", 5)
    step_card(pdf, "1", "KEEP THE APP OPEN", "The setup script registers usa_map_studio. Restart the AI client, open USA Map Studio, then use /mcp to confirm the connection.", 40, 516, 166, 100)
    step_card(pdf, "2", "ASK FOR A DRAFT", "The AI reads the named open project, uses its current timestamp, and stages one proposal. No map or saved file changes yet.", 223, 516, 166, 100, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "REVIEW IN THE APP", "Compare Before and After. Apply or Reject. After Apply, check the canvas and autosave status; Save is only needed to choose a file path.", 406, 516, 166, 100, PALE, BLUE)
    label(pdf, "Manual connection commands", 40, 478)
    code_box(pdf, "Register or repair", [
        "npm run mcp:install",
        "# Restart ChatGPT desktop or Codex, then use /mcp",
    ], 40, 380, 254, 78, GREEN)
    code_box(pdf, "Remove managed connection", [
        "npm run mcp:remove",
        "# Existing unrelated MCP settings remain in place",
    ], 318, 380, 254, 78, NAVY)
    label(pdf, "What the AI can do", 40, 346)
    bullet(pdf, "Read", "Check app status, read the project, list ordered layers or locations, and validate project JSON.", 40, 324, 250)
    bullet(pdf, "Prepare", "Create or change layers, target CSV imports, shared pin style, and complete multi-row label callouts with stored typography and lines.", 40, 270, 250, BLUE)
    bullet(pdf, "Cannot bypass review", "Write tools create one pending proposal. They cannot click Apply or write an export. After you Apply, the app's normal autosave behavior takes over.", 318, 324, 254, FORGE)
    bullet(pdf, "Stale changes stop", "If the working map changes after the AI reads it, the proposal must be rebuilt from the current project.", 318, 270, 254, GREEN)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 77, 532, 130, stroke=0, fill=1)
    label(pdf, "Privacy boundary", 56, 182, ENERGY)
    wrapped(pdf, "The bridge listens only on this computer and uses a new random token for each app launch. Project data stays local until a read tool returns it to the connected AI conversation. Use only an AI client approved for the map content. ChatGPT web cannot directly reach this private desktop bridge; that would require a separate hosted plugin.", 56, 160, 500, font="Helvetica-Bold", size=8.3, leading=11.4, color=WHITE)
    footer(pdf, 5)
    pdf.showPage()

    page_header(pdf, "Custom visual system | portable project assets", "Import a pin. Reuse the palette.", "SVG artwork stays with the project, and named ORNL swatches stay one click away.", 6)
    label(pdf, "Custom SVG pin workflow", 40, 614)
    step_card(pdf, "1", "IMPORT", "Choose All pins or This pin, select Import custom SVG pin, and open a vector-only .svg file up to 500 KB.", 40, 508, 166, 82)
    step_card(pdf, "2", "SHARE", "Keep All pins selected to guarantee the same SVG, color, and size everywhere; use This pin for an exception.", 223, 508, 166, 82, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "SAVE", "The sanitized SVG is stored inside .usmap.json. Move or share that one project file without losing the pin artwork.", 406, 508, 166, 82, PALE, BLUE)
    palette_row(pdf, "Primary", [
        ("ORNL Green", "#00662C", GREEN),
        ("Hale Navy", "#00454D", NAVY),
        ("Graphite", "#DBDCDB", GRAPHITE),
        ("Polar", "#FFFFFF", WHITE),
        ("Dark Matter", "#373A36", DARK),
    ], 40, 397, 532)
    palette_row(pdf, "Secondary", [
        ("Energy", "#7DBA00", ENERGY),
        ("Mist", "#8BFEBF", MIST),
        ("Biome", "#00B38F", BIOME),
        ("Aqua", "#00BDB5", AQUA),
        ("Infinity", "#006BA6", BLUE),
        ("Hydro", "#005776", HYDRO),
    ], 40, 300, 532)
    palette_row(pdf, "Accent", [
        ("Forge", "#FF9E1B", FORGE),
        ("Spark", "#FE5000", SPARK),
        ("Plasma", "#B50094", PLASMA),
        ("Pulsar", "#4E008E", PULSAR),
    ], 40, 203, 532)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 77, 532, 96, stroke=0, fill=1)
    label(pdf, "Safe by design", 56, 149, ENERGY)
    wrapped(pdf, "The importer keeps safe Illustrator gradient and stroke styling while removing scripts, event handlers, external references, embedded raster images, unsafe styles, and unsupported elements. ORNL swatches are a draft aid: check contrast, use accents sparingly, and complete normal communications review before release.", 56, 128, 500, font="Helvetica-Bold", size=8.1, leading=11.1, color=WHITE)
    footer(pdf, 6)
    pdf.save()


if __name__ == "__main__":
    build_pdf(OUTPUT)
    print(OUTPUT)
