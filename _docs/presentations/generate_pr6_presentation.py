import pptx
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

# 16:9 widescreen presentation
prs = pptx.Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank_layout = prs.slide_layouts[6]

# Exact Colors from Reference Template
COLOR_DARK_BG = RGBColor(27, 38, 36)        # #1B2624 Deep Dark Slate Green
COLOR_LIGHT_BG = RGBColor(245, 245, 245)    # #F5F5F5 Warm Light Gray
COLOR_WHITE = RGBColor(255, 255, 255)       # Pure White
COLOR_DARK_TEXT = RGBColor(27, 38, 36)      # #1B2624
COLOR_MUTED_TEXT = RGBColor(107, 114, 128)  # #6B7280 Muted Gray
COLOR_TITLE_BLUE = RGBColor(0, 150, 180)    # Blue Accent bar on dark
COLOR_CARD_DARK = RGBColor(34, 48, 45)      # Slightly lighter dark card
COLOR_DARK_CARD = RGBColor(34, 48, 45)
COLOR_GREEN_CARD = RGBColor(46, 125, 50)    # Green Accent
COLOR_BLUE_CARD = RGBColor(25, 118, 210)    # Blue Accent
COLOR_YELLOW_CARD = RGBColor(245, 124, 0)   # Yellow/Amber Accent
COLOR_BORDER_LIGHT = RGBColor(203, 213, 225)# Slate 300
COLOR_TH_BG = RGBColor(230, 238, 235)       # Table Header fill
COLOR_ROW_ALT = RGBColor(240, 246, 244)     # Table Row Alternate
COLOR_CODE_BG = RGBColor(255, 255, 255)     # Code banner fill

FONT_THAI = "Prompt" # fallback to Segoe UI if Prompt is not local

def set_bg(slide, color):
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
    bg.fill.solid()
    bg.fill.fore_color.rgb = color
    bg.line.fill.background()
    return bg

def add_header(slide, title_text):
    tb = slide.shapes.add_textbox(Inches(0.9), Inches(0.7), Inches(11.5), Inches(0.8))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = title_text
    p.font.name = FONT_THAI
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = COLOR_DARK_TEXT

def add_footer(slide, text):
    tb = slide.shapes.add_textbox(Inches(0.9), Inches(6.8), Inches(11.5), Inches(0.4))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = text
    p.font.name = FONT_THAI
    p.font.size = Pt(10)
    p.font.color.rgb = COLOR_MUTED_TEXT

def create_table(slide, rows, cols, left, top, width, height, col_widths=None):
    shape = slide.shapes.add_table(rows, cols, left, top, width, height)
    tbl = shape.table
    if col_widths:
        for idx, w in enumerate(col_widths):
            tbl.columns[idx].width = w
    return tbl

def style_cell(cell, text, bold=False, font_size=10.5, font_color=COLOR_DARK_TEXT, bg_color=None, align=PP_ALIGN.LEFT):
    if bg_color:
        cell.fill.solid()
        cell.fill.fore_color.rgb = bg_color
    else:
        cell.fill.solid()
        cell.fill.fore_color.rgb = COLOR_WHITE
    tf = cell.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.12)
    tf.margin_right = Inches(0.12)
    tf.margin_top = Inches(0.08)
    tf.margin_bottom = Inches(0.08)
    p = tf.paragraphs[0]
    p.text = text
    p.alignment = align
    p.font.name = FONT_THAI
    p.font.size = Pt(font_size)
    p.font.bold = bold
    p.font.color.rgb = font_color

# ==============================================================================
# SLIDE 1: Cover (Dark Slate Minimalist)
# ==============================================================================
s1 = prs.slides.add_slide(blank_layout)
set_bg(s1, COLOR_DARK_BG)

# Vertical Accent Bar
bar = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.2), Inches(1.5), Inches(0.12), Inches(1.3))
bar.fill.solid()
bar.fill.fore_color.rgb = COLOR_TITLE_BLUE
bar.line.fill.background()

# Title text box
tb1 = s1.shapes.add_textbox(Inches(1.2), Inches(3.2), Inches(11.0), Inches(3.2))
tf1 = tb1.text_frame
tf1.word_wrap = True
tf1.margin_left = tf1.margin_top = tf1.margin_right = tf1.margin_bottom = 0

# Tag
p_sub = tf1.paragraphs[0]
p_sub.text = "CN360  ·  รายงานความคืบหน้า"
p_sub.font.name = FONT_THAI
p_sub.font.size = Pt(13)
p_sub.font.color.rgb = RGBColor(140, 160, 155)

# Main Title (2 lines)
p_t1 = tf1.add_paragraph()
p_t1.text = "ขับ RoverC จาก PICO 4"
p_t1.font.name = FONT_THAI
p_t1.font.size = Pt(36)
p_t1.font.bold = True
p_t1.font.color.rgb = COLOR_WHITE
p_t1.space_before = Pt(14)

p_t2 = tf1.add_paragraph()
p_t2.text = "และกล้อง Pan/Tilt สตรีมสด WebRTC"
p_t2.font.name = FONT_THAI
p_t2.font.size = Pt(36)
p_t2.font.bold = True
p_t2.font.color.rgb = COLOR_WHITE

# Subtitle
p_desc = tf1.add_paragraph()
p_desc.text = "หุ่นยนต์สำรวจพื้นที่แคบ ควบคุมผ่าน PICO 4 · PR #6 (Mecanum Bridge) & PR #7 (Pan/Tilt Camera)"
p_desc.font.name = FONT_NAME if 'FONT_NAME' in dir() else FONT_THAI
p_desc.font.name = FONT_THAI
p_desc.font.size = Pt(13)
p_desc.font.color.rgb = RGBColor(180, 195, 190)
p_desc.space_before = Pt(18)

# Date at bottom left
tb_date = s1.shapes.add_textbox(Inches(1.2), Inches(6.5), Inches(4.0), Inches(0.4))
tf_date = tb_date.text_frame
p_date = tf_date.paragraphs[0]
p_date.text = "พฤศจิกายน 2026"
p_date.font.name = FONT_THAI
p_date.font.size = Pt(11)
p_date.font.color.rgb = RGBColor(120, 140, 135)

# ==============================================================================
# SLIDE 2: ระบบทั้งหมดบนหุ่นจริง (Overall Architecture Map)
# ==============================================================================
s2 = prs.slides.add_slide(blank_layout)
set_bg(s2, COLOR_LIGHT_BG)
add_header(s2, "ระบบทั้งหมดบนหุ่นจริง")

# Node 1: PICO 4 / PC (White card)
c_pico = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(2.2), Inches(2.2), Inches(1.3))
c_pico.fill.solid(); c_pico.fill.fore_color.rgb = COLOR_WHITE; c_pico.line.color.rgb = COLOR_DARK_TEXT; c_pico.line.width = Pt(1.5)
tf = c_pico.text_frame; tf.margin_top = Inches(0.2)
p = tf.paragraphs[0]; p.text = "PICO 4 / PC"; p.font.bold = True; p.font.size = Pt(13); p.font.color.rgb = COLOR_DARK_TEXT; p.alignment = PP_ALIGN.CENTER
p2 = tf.add_paragraph(); p2.text = "ผู้ควบคุม · เว็บ VEIL"; p2.font.size = Pt(9.5); p2.font.color.rgb = COLOR_MUTED_TEXT; p2.alignment = PP_ALIGN.CENTER

# Node 2: Laptop Bridge (White card)
c_bridge = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(4.1), Inches(2.2), Inches(1.3))
c_bridge.fill.solid(); c_bridge.fill.fore_color.rgb = COLOR_WHITE; c_bridge.line.color.rgb = COLOR_DARK_TEXT; c_bridge.line.width = Pt(1.5)
tf = c_bridge.text_frame; tf.margin_top = Inches(0.2)
p = tf.paragraphs[0]; p.text = "Laptop Bridge"; p.font.bold = True; p.font.size = Pt(13); p.font.color.rgb = COLOR_DARK_TEXT; p.alignment = PP_ALIGN.CENTER
p2 = tf.add_paragraph(); p2.text = "Vite HTTPS + Node :8765"; p2.font.size = Pt(9.5); p2.font.color.rgb = COLOR_MUTED_TEXT; p2.alignment = PP_ALIGN.CENTER

# Node 3: Camera Pi Cam v2 (White card)
c_cam = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(4.2), Inches(1.7), Inches(2.3), Inches(1.1))
c_cam.fill.solid(); c_cam.fill.fore_color.rgb = COLOR_WHITE; c_cam.line.color.rgb = COLOR_DARK_TEXT; c_cam.line.width = Pt(1.5)
tf = c_cam.text_frame; tf.margin_top = Inches(0.15)
p = tf.paragraphs[0]; p.text = "กล้อง Pi Camera v2"; p.font.bold = True; p.font.size = Pt(12); p.font.color.rgb = COLOR_DARK_TEXT; p.alignment = PP_ALIGN.CENTER
p2 = tf.add_paragraph(); p2.text = "imx219 · Hardware H.264"; p2.font.size = Pt(9); p2.font.color.rgb = COLOR_MUTED_TEXT; p2.alignment = PP_ALIGN.CENTER

# Node 4: Raspberry Pi 4 (Green Solid Card)
c_pi = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(4.2), Inches(3.2), Inches(2.5), Inches(2.8))
c_pi.fill.solid(); c_pi.fill.fore_color.rgb = RGBColor(46, 125, 50); c_pi.line.fill.background()
tf = c_pi.text_frame; tf.margin_left = Inches(0.2); tf.margin_top = Inches(0.25)
p = tf.paragraphs[0]; p.text = "Raspberry Pi 4"; p.font.bold = True; p.font.size = Pt(14); p.font.color.rgb = COLOR_WHITE
items_pi = ["สมองส่วนกล้อง & สตรีม", "MediaMTX (WebRTC :8889)", "control.py (PWM Pan/Tilt)", "Wi-Fi AP / STA"]
for it in items_pi:
    p_it = tf.add_paragraph(); p_it.text = f"• {it}"; p_it.font.size = Pt(9.5); p_it.font.color.rgb = RGBColor(220, 245, 225); p_it.space_before = Pt(4)

# Node 5: RoverC Robot (Blue Solid Card)
c_rover = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.5), Inches(3.2), Inches(2.4), Inches(2.8))
c_rover.fill.solid(); c_rover.fill.fore_color.rgb = RGBColor(25, 118, 210); c_rover.line.fill.background()
tf = c_rover.text_frame; tf.margin_left = Inches(0.2); tf.margin_top = Inches(0.25)
p = tf.paragraphs[0]; p.text = "M5 RoverC"; p.font.bold = True; p.font.size = Pt(14); p.font.color.rgb = COLOR_WHITE
items_rc = ["M5StickC Plus (ESP32)", "Wi-Fi AP: RoverC-XXXX", "WebSocket Server :81", "คุมล้อ Mecanum 4 ล้อ"]
for it in items_rc:
    p_it = tf.add_paragraph(); p_it.text = f"• {it}"; p_it.font.size = Pt(9.5); p_it.font.color.rgb = RGBColor(220, 235, 252); p_it.space_before = Pt(4)

# Hardware components on the right
hw_items = [
    ("Servo Pan", "SG90 · PWM0 GPIO12 · หมุนซ้าย-ขวา ±70°"),
    ("Servo Tilt", "SG90 · PWM1 GPIO13 · ก้ม-เงย -30°..+50°"),
    ("ล้อ Mecanum ×4", "ขับเคลื่อน 6 ทิศทาง (หน้า/หลัง/สไลด์/หมุน)"),
    ("ไฟเลี้ยง 5V 3A แยก", "จ่ายไฟแยกให้ Servo ป้องกันสัญญาณกวน")
]
for idx, (title_h, desc_h) in enumerate(hw_items):
    y_pos = Inches(1.9 + idx * 1.15)
    c_hw = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.3), y_pos, Inches(2.3), Inches(0.95))
    c_hw.fill.solid(); c_hw.fill.fore_color.rgb = COLOR_WHITE; c_hw.line.color.rgb = COLOR_BORDER_LIGHT; c_hw.line.width = Pt(1)
    tf = c_hw.text_frame; tf.margin_left = Inches(0.12); tf.margin_top = Inches(0.12)
    p = tf.paragraphs[0]; p.text = title_h; p.font.bold = True; p.font.size = Pt(11); p.font.color.rgb = COLOR_DARK_TEXT
    p2 = tf.add_paragraph(); p2.text = desc_h; p2.font.size = Pt(8.5); p2.font.color.rgb = COLOR_MUTED_TEXT

add_footer(s2, "ดำ = สัญญาณควบคุม (WSS/WS)  ·  เขียว = คำสั่งฮาร์ดแวร์ PWM  ·  ฟ้า = สตรีมมิ่งวิดีโอ WebRTC WHEP")

# ==============================================================================
# SLIDE 3: ข้อความเดียว เดินผ่านหลายช่องทาง (Protocol Communication Paths)
# ==============================================================================
s3 = prs.slides.add_slide(blank_layout)
set_bg(s3, COLOR_LIGHT_BG)
add_header(s3, "ข้อความเดียว เดินผ่านหลายช่องทาง")

# Diagram Top Box (4 blocks)
steps_diag = [
    ("เว็บ VEIL", "PICO 4 / PC", Inches(0.9), Inches(1.7), Inches(2.2)),
    ("Laptop Bridge", "ตรวจแล้วแปลงค่า", Inches(3.9), Inches(1.7), Inches(2.2)),
    ("RoverC Base", "รับ JSON สั่ง 4 ล้อ", Inches(6.9), Inches(1.7), Inches(2.2)),
    ("Pan/Tilt บน Pi", "Hardware PWM", Inches(9.9), Inches(1.7), Inches(2.5))
]
for t_box, sub_box, l_b, t_b, w_b in steps_diag:
    card_b = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, l_b, t_b, w_b, Inches(1.05))
    card_b.fill.solid(); card_b.fill.fore_color.rgb = COLOR_WHITE; card_b.line.color.rgb = COLOR_DARK_TEXT; card_b.line.width = Pt(1.5)
    tf = card_b.text_frame; tf.margin_top = Inches(0.15)
    p = tf.paragraphs[0]; p.text = t_box; p.font.bold = True; p.font.size = Pt(12); p.font.color.rgb = COLOR_DARK_TEXT; p.alignment = PP_ALIGN.CENTER
    p2 = tf.add_paragraph(); p2.text = sub_box; p2.font.size = Pt(9); p2.font.color.rgb = COLOR_MUTED_TEXT; p2.alignment = PP_ALIGN.CENTER

# Summary note
tb_note = s3.shapes.add_textbox(Inches(0.9), Inches(2.85), Inches(11.5), Inches(0.35))
tf_n = tb_note.text_frame
p_n = tf_n.paragraphs[0]
p_n.text = "คำสั่งขับเคลื่อนส่งผ่าน Bridge แปลงเป็น JSON ส่วนมุมกล้องส่งตรงเข้า Raspberry Pi ผ่าน WebSocket wss://:8000/ws"
p_n.font.name = FONT_THAI; p_n.font.size = Pt(10.5); p_n.font.color.rgb = COLOR_MUTED_TEXT

# Table
col_w = [Inches(2.5), Inches(2.2), Inches(6.8)]
tbl_proto = create_table(s3, 6, 3, Inches(0.9), Inches(3.3), Inches(11.5), Inches(3.3), col_w)

headers = ["ช่วง", "Protocol", "รายละเอียด"]
for c_idx, h in enumerate(headers):
    style_cell(tbl_proto.cell(0, c_idx), h, bold=True, font_size=11, font_color=COLOR_DARK_TEXT, bg_color=COLOR_TH_BG)

rows_data = [
    ("PICO 4 → Laptop", "WSS (WebSocket)", "ส่ง DRIVE (Protocol v1) ผ่าน HTTPS proxy พอร์ต 5173"),
    ("Laptop → RoverC", "WS (JSON :81)", "Bridge แปลง DRIVE เป็น {\"type\":\"move\",\"dir\":\"...\"} เข้า AP 192.168.4.1"),
    ("PICO 4 → Pi (Head)", "WSS (JSON :8000)", "ส่งมุมศีรษะ {\"pan\":..,\"tilt\":..} เข้า control.py ทุก 25 ms"),
    ("Pi → SG90 Servos", "Hardware PWM", "GPIO12/13 ควบคุม Pan (0.6–2.4 ms) และ Tilt (1–2 ms) สัญญาณนิ่งไม่สั่น"),
    ("Pi → PICO 4 (วิดีโอ)", "WebRTC (WHEP :8889)", "กล้อง Pi Cam v2 (H.264) สตรีมผ่าน MediaMTX ตรงเข้าเบราว์เซอร์ PICO 4")
]
for r_idx, row in enumerate(rows_data, start=1):
    bg_c = COLOR_ROW_ALT if r_idx % 2 == 1 else COLOR_WHITE
    for c_idx, val in enumerate(row):
        style_cell(tbl_proto.cell(r_idx, c_idx), val, bold=(c_idx==0), font_size=10, bg_color=bg_c)

add_footer(s3, "สถาปัตยกรรมแยกช่องสัญญาณ: ควบคุมการขับเคลื่อนและวิดีโอออกจากกันเพื่อลด Latency และป้องกันคอขวด")

# ==============================================================================
# SLIDE 4: Command Protocol (รูปแบบคำสั่งและกติกา)
# ==============================================================================
s4 = prs.slides.add_slide(blank_layout)
set_bg(s4, COLOR_LIGHT_BG)
add_header(s4, "Command Protocol")

# Left Column: รูปแบบข้อความ
tb_sub_l = s4.shapes.add_textbox(Inches(0.9), Inches(1.5), Inches(5.4), Inches(0.4))
tb_sub_l.text_frame.paragraphs[0].text = "รูปแบบข้อความ"
tb_sub_l.text_frame.paragraphs[0].font.name = FONT_THAI
tb_sub_l.text_frame.paragraphs[0].font.bold = True
tb_sub_l.text_frame.paragraphs[0].font.size = Pt(14)
tb_sub_l.text_frame.paragraphs[0].font.color.rgb = COLOR_DARK_TEXT

# White code card
c_code = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(2.0), Inches(5.4), Inches(3.2))
c_code.fill.solid(); c_code.fill.fore_color.rgb = COLOR_WHITE; c_code.line.color.rgb = COLOR_BORDER_LIGHT; c_code.line.width = Pt(1)
tf_code = c_code.text_frame; tf_code.margin_left = Inches(0.25); tf_code.margin_top = Inches(0.25)

msgs = [
    "DRIVE,<seq>,<linear>,<angular>,<mode>,[strafe]",
    "HEAD,<seq>,<yaw>,<pitch>,<roll>",
    "{\"pan\": <deg>, \"tilt\": <deg>}   (WebRTC /ws)",
    "STATUS,<seq>,<battery_v>,<ack_seq>"
]
for idx, m in enumerate(msgs):
    p = tf_code.paragraphs[0] if idx == 0 else tf_code.add_paragraph()
    p.text = m
    p.font.name = "Consolas"
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = COLOR_DARK_TEXT
    if idx > 0: p.space_before = Pt(16)

tb_note_l = s4.shapes.add_textbox(Inches(0.9), Inches(5.35), Inches(5.4), Inches(0.5))
p_nl = tb_note_l.text_frame.paragraphs[0]
p_nl.text = "DRIVE, HEAD: เว็บ → Bridge/Pi  ·  STATUS: ส่งตอบกลับเว็บ"
p_nl.font.name = FONT_THAI; p_nl.font.size = Pt(10); p_nl.font.color.rgb = COLOR_MUTED_TEXT

# Right Column: กติกา (Table)
tb_sub_r = s4.shapes.add_textbox(Inches(6.8), Inches(1.5), Inches(5.6), Inches(0.4))
tb_sub_r.text_frame.paragraphs[0].text = "กติกา"
tb_sub_r.text_frame.paragraphs[0].font.name = FONT_THAI
tb_sub_r.text_frame.paragraphs[0].font.bold = True
tb_sub_r.text_frame.paragraphs[0].font.size = Pt(14)
tb_sub_r.text_frame.paragraphs[0].font.color.rgb = COLOR_DARK_TEXT

col_w_r = [Inches(1.8), Inches(3.8)]
tbl_rules = create_table(s4, 6, 2, Inches(6.8), Inches(2.0), Inches(5.6), Inches(3.6), col_w_r)
style_cell(tbl_rules.cell(0, 0), "เรื่อง", bold=True, font_size=11, bg_color=COLOR_TH_BG)
style_cell(tbl_rules.cell(0, 1), "ค่า / ข้อกำหนด", bold=True, font_size=11, bg_color=COLOR_TH_BG)

rules_data = [
    ("รูปแบบ", "ASCII คั่นด้วยลูกน้ำ หนึ่งบรรทัดต่อหนึ่งคำสั่ง"),
    ("อัตราส่ง", "10–20 ครั้งต่อวินาที (คุมไม่ให้เกิน Rate limit ของบอร์ด)"),
    ("seq", "เพิ่มทีละ 1 ใช้ทิ้งคำสั่งเก่าที่มาถึงช้าและวัด Round-trip ping"),
    ("ทศนิยม", "ใช้เครื่องหมายจุดเสมอ ไม่ขึ้นกับภาษาเครื่อง"),
    ("Failsafe", "ไม่มีคำสั่งเกิน 300 ms → สั่งหยุดมอเตอร์อัตโนมัติทันที")
]
for r_idx, (r_name, r_val) in enumerate(rules_data, start=1):
    bg_c = COLOR_ROW_ALT if r_idx % 2 == 1 else COLOR_WHITE
    style_cell(tbl_rules.cell(r_idx, 0), r_name, bold=True, font_size=10, bg_color=bg_c)
    style_cell(tbl_rules.cell(r_idx, 1), r_val, font_size=10, bg_color=bg_c)

add_footer(s4, "PR #6 เพิ่มฟิลด์ที่ 6 (strafe) สำหรับล้อ Mecanum โดยส่งเฉพาะเมื่อมีค่าเพื่อรองรับหุ่นยนต์รุ่นเดิม")

# ==============================================================================
# SLIDE 5: รายละเอียดทุก message (4 Cards Layout)
# ==============================================================================
s5 = prs.slides.add_slide(blank_layout)
set_bg(s5, COLOR_LIGHT_BG)
add_header(s5, "รายละเอียดทุก message")

card_defs = [
    ("DRIVE", "เว็บ → Bridge → RoverC · 10–20 Hz",
     ["• linear −1…1 · บวก = เดินหน้า",
      "• strafe −1…1 · บวก = สไลด์ขวา (ฟิลด์ที่ 6)",
      "• angular −1…1 · บวก = หมุนตัวขวา",
      "• mode 1 = ปกติ, 2 = High Speed / Torque"],
     Inches(0.9), Inches(1.8), Inches(5.5), Inches(2.2)),
    
    ("HEAD", "เว็บ → Raspberry Pi · 20–40 Hz",
     ["• yaw −70…70° · บวก = หันขวา (SG90 Pan)",
      "• pitch −30…50° · บวก = ก้ม (SG90 Tilt)",
      "• roll ใส่ 0 (ยังไม่มีแกนที่ 3)",
      "• ส่งผ่าน WebSocket JSON: {\"pan\":...,\"tilt\":...}"],
     Inches(6.9), Inches(1.8), Inches(5.5), Inches(2.2)),
    
    ("LIGHT / FAILSAFE", "การควบคุมไฟและความปลอดภัย",
     ["• brightness 0…100 % (สเปก Protocol v1)",
      "• Dead-man Switch: กำ Left Grip ค้างตลอดเวลาขับ",
      "• Zero-Deadzone: โยกคืนกลางสั่ง STOP ทันที",
      "• IDLE_STOP: 1.5 วินาทีตัด PWM พักเซอร์โว"],
     Inches(0.9), Inches(4.3), Inches(5.5), Inches(2.2)),
    
    ("STATUS", "Robot / Pi → เว็บ · ทุก 1 วินาที",
     ["• battery_v แรงดันแบต (RoverC ส่ง 0.00 V)",
      "• ack_seq ลำดับ seq ล่าสุดที่ฮาร์ดแวร์ได้รับ",
      "• เว็บใช้ ack_seq ในการคำนวณ Round-trip Latency",
      "• แจ้งเตือนสั่น/เสียงเมื่อเซอร์โว Pan/Tilt หมุนสุดขอบ"],
     Inches(6.9), Inches(4.3), Inches(5.5), Inches(2.2))
]

for title_c, sub_c, lines_c, l_c, t_c, w_c, h_c in card_defs:
    card_shape = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, l_c, t_c, w_c, h_c)
    card_shape.fill.solid(); card_shape.fill.fore_color.rgb = COLOR_WHITE
    card_shape.line.color.rgb = COLOR_BORDER_LIGHT; card_shape.line.width = Pt(1)
    tf_c = card_shape.text_frame; tf_c.margin_left = Inches(0.25); tf_c.margin_top = Inches(0.2)
    
    p0 = tf_c.paragraphs[0]; p0.text = title_c; p0.font.bold = True; p0.font.size = Pt(15); p0.font.color.rgb = COLOR_DARK_TEXT
    p1 = tf_c.add_paragraph(); p1.text = sub_c; p1.font.size = Pt(10); p1.font.color.rgb = COLOR_MUTED_TEXT; p1.space_before = Pt(2)
    for line in lines_c:
        p_l = tf_c.add_paragraph(); p_l.text = line; p_l.font.size = Pt(10); p_l.font.color.rgb = COLOR_DARK_TEXT; p_l.space_before = Pt(4)

add_footer(s5, "ทุกข้อความเริ่มด้วย seq ที่เพิ่มทีละ 1  ·  ระบบ Failsafe 300 ms ตัดการทำงานอัตโนมัติเมื่อสัญญาณขาดหาย")

# ==============================================================================
# SLIDE 6: คำสั่งขับ: DRIVE (ตารางคำสั่งและความหมาย)
# ==============================================================================
s6 = prs.slides.add_slide(blank_layout)
set_bg(s6, COLOR_LIGHT_BG)
add_header(s6, "คำสั่งขับ: DRIVE")

# Banner
b_code6 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(1.5), Inches(11.5), Inches(0.55))
b_code6.fill.solid(); b_code6.fill.fore_color.rgb = COLOR_WHITE; b_code6.line.color.rgb = COLOR_BORDER_LIGHT; b_code6.line.width = Pt(1)
tf_b6 = b_code6.text_frame; tf_b6.margin_left = Inches(0.2); tf_b6.margin_top = Inches(0.12)
p_b6 = tf_b6.paragraphs[0]
p_b6.text = "DRIVE,<seq>,<linear>,<angular>,<mode>,[strafe]"
p_b6.font.name = "Consolas"; p_b6.font.size = Pt(12); p_b6.font.bold = True; p_b6.font.color.rgb = COLOR_DARK_TEXT

# Left Table: Field defs
col_w_6a = [Inches(1.2), Inches(2.6), Inches(1.6)]
tbl_6a = create_table(s6, 6, 3, Inches(0.9), Inches(2.25), Inches(5.4), Inches(3.6), col_w_6a)
style_cell(tbl_6a.cell(0, 0), "ช่อง", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)
style_cell(tbl_6a.cell(0, 1), "ความหมาย", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)
style_cell(tbl_6a.cell(0, 2), "ช่วงค่า", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)

fields_6a = [
    ("seq", "ลำดับคำสั่ง", "1, 2, 3 …"),
    ("linear", "เดินหน้า-ถอย · บวก = หน้า", "−1 ถึง 1"),
    ("angular", "เลี้ยว · บวก = ขวา", "−1 ถึง 1"),
    ("mode", "1 = ปกติ, 2 = High Speed", "1 หรือ 2"),
    ("strafe", "สไลด์ข้าง · บวก = สไลด์ขวา", "−1 ถึง 1")
]
for idx, (f_name, f_desc, f_range) in enumerate(fields_6a, start=1):
    bg_c = COLOR_ROW_ALT if idx % 2 == 1 else COLOR_WHITE
    style_cell(tbl_6a.cell(idx, 0), f_name, bold=True, font_size=10, bg_color=bg_c)
    style_cell(tbl_6a.cell(idx, 1), f_desc, font_size=10, bg_color=bg_c)
    style_cell(tbl_6a.cell(idx, 2), f_range, font_size=10, bg_color=bg_c)

# Right Table: Examples
col_w_6b = [Inches(3.2), Inches(2.6)]
tbl_6b = create_table(s6, 6, 2, Inches(6.6), Inches(2.25), Inches(5.8), Inches(3.6), col_w_6b)
style_cell(tbl_6b.cell(0, 0), "ข้อความตัวอย่าง", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)
style_cell(tbl_6b.cell(0, 1), "หุ่น RoverC ทำอะไร", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)

fields_6b = [
    ("DRIVE,1,0.50,0.00,1", "เดินหน้าครึ่งความเร็ว (Speed 15)"),
    ("DRIVE,2,-0.50,0.00,1", "ถอยหลัง"),
    ("DRIVE,3,0.00,1.00,1", "หมุนตัวไปทางขวา (Rotate Right)"),
    ("DRIVE,4,0.00,0.00,1,0.80", "สไลด์ไปทางขวา (Mecanum Strafe Right)"),
    ("DRIVE,5,0.00,0.00,1,0.00", "หยุดการเคลื่อนที่ (Stop / Deadzone)")
]
for idx, (f_msg, f_act) in enumerate(fields_6b, start=1):
    bg_c = COLOR_ROW_ALT if idx % 2 == 1 else COLOR_WHITE
    style_cell(tbl_6b.cell(idx, 0), f_msg, bold=True, font_size=9.5, bg_color=bg_c)
    style_cell(tbl_6b.cell(idx, 1), f_act, font_size=10, bg_color=bg_c)

add_footer(s6, "ไม่มี DRIVE เกิน 300 ms → หยุดเอง  ·  Bridge แปลงคำสั่งเป็น JSON move ส่ง ws://:81 เข้า RoverC")

# ==============================================================================
# SLIDE 7: คำสั่ง servo: HEAD และ Pan/Tilt (ควบคุมมุมกล้อง)
# ==============================================================================
s7 = prs.slides.add_slide(blank_layout)
set_bg(s7, COLOR_LIGHT_BG)
add_header(s7, "คำสั่ง servo: HEAD & Pan/Tilt")

# Banner
b_code7 = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(1.5), Inches(11.5), Inches(0.55))
b_code7.fill.solid(); b_code7.fill.fore_color.rgb = COLOR_WHITE; b_code7.line.color.rgb = COLOR_BORDER_LIGHT; b_code7.line.width = Pt(1)
tf_b7 = b_code7.text_frame; tf_b7.margin_left = Inches(0.2); tf_b7.margin_top = Inches(0.12)
p_b7 = tf_b7.paragraphs[0]
p_b7.text = "HEAD,<seq>,<yaw>,<pitch>,<roll>   หรือ   {\"pan\": <yaw>, \"tilt\": <pitch>}"
p_b7.font.name = "Consolas"; p_b7.font.size = Pt(12); p_b7.font.bold = True; p_b7.font.color.rgb = COLOR_DARK_TEXT

# Left Table: Field defs
col_w_7a = [Inches(1.2), Inches(2.6), Inches(1.6)]
tbl_7a = create_table(s7, 5, 3, Inches(0.9), Inches(2.25), Inches(5.4), Inches(3.6), col_w_7a)
style_cell(tbl_7a.cell(0, 0), "ช่อง", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)
style_cell(tbl_7a.cell(0, 1), "ความหมาย", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)
style_cell(tbl_7a.cell(0, 2), "ช่วงค่า", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)

fields_7a = [
    ("seq", "ลำดับคำสั่ง", "1, 2, 3 …"),
    ("yaw / pan", "หันซ้าย-ขวา · บวก = ขวา → GPIO12", "−70° ถึง +70°"),
    ("pitch / tilt", "ก้ม-เงย · บวก = ก้ม → GPIO13", "−30° ถึง +50°"),
    ("roll", "เอียงหัว (ยังไม่มี servo แกนนี้)", "0")
]
for idx, (f_name, f_desc, f_range) in enumerate(fields_7a, start=1):
    bg_c = COLOR_ROW_ALT if idx % 2 == 1 else COLOR_WHITE
    style_cell(tbl_7a.cell(idx, 0), f_name, bold=True, font_size=10, bg_color=bg_c)
    style_cell(tbl_7a.cell(idx, 1), f_desc, font_size=10, bg_color=bg_c)
    style_cell(tbl_7a.cell(idx, 2), f_range, font_size=10, bg_color=bg_c)

# Right Table: Examples
col_w_7b = [Inches(3.2), Inches(2.6)]
tbl_7b = create_table(s7, 5, 2, Inches(6.6), Inches(2.25), Inches(5.8), Inches(3.6), col_w_7b)
style_cell(tbl_7b.cell(0, 0), "ข้อมูลที่ส่ง (WebSocket)", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)
style_cell(tbl_7b.cell(0, 1), "ผลที่เห็นบนกล้อง Pi Cam", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)

fields_7b = [
    ("{\"pan\": 0, \"tilt\": 0}", "กล้องตั้งตรงกลาง (Center)"),
    ("{\"pan\": 45, \"tilt\": 0}", "หันขวา 45° (พัลส์ขยาย 0.6–2.4 ms)"),
    ("{\"pan\": -70, \"tilt\": 0}", "หันซ้ายสุด 70° (เตือนแถบแดง + สั่น)"),
    ("{\"pan\": 0, \"tilt\": -30}", "เงยขึ้น 30°")
]
for idx, (f_msg, f_act) in enumerate(fields_7b, start=1):
    bg_c = COLOR_ROW_ALT if idx % 2 == 1 else COLOR_WHITE
    style_cell(tbl_7b.cell(idx, 0), f_msg, bold=True, font_size=9.5, bg_color=bg_c)
    style_cell(tbl_7b.cell(idx, 1), f_act, font_size=10, bg_color=bg_c)

add_footer(s7, "ค่ามุมเกินช่วงจะถูก Clamp อัตโนมัติใน control.py  ·  มีระบบตัดกระแส PWM เมื่ออยู่นิ่งเกิน 1.5 วินาที")

# ==============================================================================
# SLIDE 8: ระบบสตรีมมิ่งสด: WebRTC บน MediaMTX (PR #7 Video)
# ==============================================================================
s8 = prs.slides.add_slide(blank_layout)
set_bg(s8, COLOR_LIGHT_BG)
add_header(s8, "ระบบสตรีมมิ่งสด: WebRTC WHEP")

# Left Column: Table of specs
tb_sub_8 = s8.shapes.add_textbox(Inches(0.9), Inches(1.5), Inches(5.4), Inches(0.4))
tb_sub_8.text_frame.paragraphs[0].text = "ข้อกำหนดการสตรีมมิ่งวิดีโอ"
tb_sub_8.text_frame.paragraphs[0].font.name = FONT_THAI
tb_sub_8.text_frame.paragraphs[0].font.bold = True
tb_sub_8.text_frame.paragraphs[0].font.size = Pt(14)
tb_sub_8.text_frame.paragraphs[0].font.color.rgb = COLOR_DARK_TEXT

col_w_8 = [Inches(2.0), Inches(3.4)]
tbl_8 = create_table(s8, 6, 2, Inches(0.9), Inches(2.0), Inches(5.4), Inches(3.8), col_w_8)
style_cell(tbl_8.cell(0, 0), "หัวข้อ", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)
style_cell(tbl_8.cell(0, 1), "รายละเอียด", bold=True, font_size=10.5, bg_color=COLOR_TH_BG)

specs_8 = [
    ("มีเดียเซิร์ฟเวอร์", "MediaMTX v1.21.3 (linux arm64)"),
    ("โปรโตคอลภาพ", "WebRTC WHEP (HTTPS พอร์ต 8889)"),
    ("ฮาร์ดแวร์กล้อง", "Raspberry Pi Camera Module v2 (imx219)"),
    ("การเข้ารหัส", "Hardware H.264 Encoder บน Pi 4"),
    ("ความหน่วง (Latency)", "Ultra-low latency (< 150 ms) ไม่กระตุกเหมือน MJPEG")
]
for idx, (sp_name, sp_val) in enumerate(specs_8, start=1):
    bg_c = COLOR_ROW_ALT if idx % 2 == 1 else COLOR_WHITE
    style_cell(tbl_8.cell(idx, 0), sp_name, bold=True, font_size=10, bg_color=bg_c)
    style_cell(tbl_8.cell(idx, 1), sp_val, font_size=10, bg_color=bg_c)

# Right Column: Why WebRTC & Comparison Card
c_comp = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.7), Inches(2.0), Inches(5.7), Inches(3.8))
c_comp.fill.solid(); c_comp.fill.fore_color.rgb = COLOR_WHITE; c_comp.line.color.rgb = COLOR_BORDER_LIGHT; c_comp.line.width = Pt(1)
tf_comp = c_comp.text_frame; tf_comp.margin_left = Inches(0.25); tf_comp.margin_top = Inches(0.25)

p_ct = tf_comp.paragraphs[0]; p_ct.text = "เปรียบเทียบกับระบบเดิม (MJPEG vs WebRTC)"; p_ct.font.bold = True; p_ct.font.size = Pt(13); p_ct.font.color.rgb = COLOR_DARK_TEXT

items_comp = [
    ("MJPEG เดิม (webcam.py):", "ส่ง JPEG ทีละเฟรมผ่าน HTTP Snapshot กินแบนด์วิธสูง ภาพหน่วง ค้างบ่อยเมื่อเครือข่ายแกว่ง และแย่งสิทธิ์กล้อง"),
    ("WebRTC ใหม่ (MediaMTX):", "ส่งสัญญาณแบบ Real-time Stream มีกลไกปรับ Bitrate อัตโนมัติ ถอดรหัส H.264 ได้อย่างลื่นไหลบนเบราว์เซอร์ PICO 4"),
    ("Exclusive Camera Access:", "MediaMTX เป็นผู้ถือครองกล้องแต่เพียงผู้เดียว ป้องกันปัญหา Device Busy ที่พบบ่อย")
]
for title_cp, desc_cp in items_comp:
    p_t = tf_comp.add_paragraph(); p_t.text = title_cp; p_t.font.bold = True; p_t.font.size = Pt(10.5); p_t.font.color.rgb = COLOR_BLUE_CARD; p_t.space_before = Pt(8)
    p_d = tf_comp.add_paragraph(); p_d.text = desc_cp; p_d.font.size = Pt(9.5); p_d.font.color.rgb = COLOR_MUTED_TEXT; p_d.space_before = Pt(2)

add_footer(s8, "เปิดรับชมผ่าน PICO Browser ได้ทันทีที่ https://<pi-ip>:8000/vr โดยไม่ต้องลงโปรแกรมเสริม")

# ==============================================================================
# SLIDE 9: Hardware PWM & วงจรการต่อสาย (Wiring Diagram)
# ==============================================================================
s9 = prs.slides.add_slide(blank_layout)
set_bg(s9, COLOR_LIGHT_BG)
add_header(s9, "วงจรและพิน: Hardware PWM บน Pi 4")

# Left Box: Raspberry Pi 4 Block
c_pi_wire = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(1.8), Inches(3.6), Inches(4.5))
c_pi_wire.fill.solid(); c_pi_wire.fill.fore_color.rgb = COLOR_DARK_CARD; c_pi_wire.line.fill.background()
tf_pw = c_pi_wire.text_frame; tf_pw.margin_left = Inches(0.25); tf_pw.margin_top = Inches(0.25)
p_pw0 = tf_pw.paragraphs[0]; p_pw0.text = "Raspberry Pi 4"; p_pw0.font.bold = True; p_pw0.font.size = Pt(16); p_pw0.font.color.rgb = COLOR_WHITE

pin_lines = [
    "GPIO 12 (Pin 32) ➔ PWM Channel 0",
    "GPIO 13 (Pin 33) ➔ PWM Channel 1",
    "GND (Pin 34/39)  ➔ Common Ground",
    "CSI Ribbon Cable ➔ Pi Camera v2",
    "",
    "Kernel Configuration:",
    "dtoverlay=pwm-2chan,",
    "pin=12,func=4,pin2=13,func2=4"
]
for pline in pin_lines:
    p_pl = tf_pw.add_paragraph(); p_pl.text = pline; p_pl.font.name = "Consolas"; p_pl.font.size = Pt(9.5); p_pl.font.color.rgb = RGBColor(220, 235, 230); p_pl.space_before = Pt(3)

# Right Stack: Hardware Actuators
actuators = [
    ("Servo Pan (หมุนซ้าย-ขวา)", "SG90 Micro Servo · รับสัญญาณ PWM Channel 0 (GPIO12)\nใช้พัลส์ duty_wide (0.6–2.4 ms) เพื่อขยายมุมกว้าง 140°"),
    ("Servo Tilt (ก้ม-เงย)", "SG90 Micro Servo · รับสัญญาณ PWM Channel 1 (GPIO13)\nใช้พัลส์ tduty (0.8–2.2 ms) รองรับช่วงก้ม 50° ถึง เงย 30°"),
    ("แหล่งจ่ายไฟภายนอก (5V 3A)", "แยกรางจ่ายไฟ 5V ให้มอเตอร์ SG90 โดยเฉพาะ ป้องกันไฟตก\nและเชื่อมต่อสาย Ground ร่วมกับ Raspberry Pi เพื่อรักษาเสถียรภาพ")
]
for idx, (t_act, d_act) in enumerate(actuators):
    y_act = Inches(1.8 + idx * 1.55)
    c_act = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(5.0), y_act, Inches(7.4), Inches(1.3))
    c_act.fill.solid(); c_act.fill.fore_color.rgb = COLOR_WHITE; c_act.line.color.rgb = COLOR_BORDER_LIGHT; c_act.line.width = Pt(1)
    tf_a = c_act.text_frame; tf_a.margin_left = Inches(0.2); tf_a.margin_top = Inches(0.18)
    p = tf_a.paragraphs[0]; p.text = t_act; p.font.bold = True; p.font.size = Pt(12); p.font.color.rgb = COLOR_DARK_TEXT
    p2 = tf_a.add_paragraph(); p2.text = d_act; p2.font.size = Pt(10); p2.font.color.rgb = COLOR_MUTED_TEXT; p2.space_before = Pt(4)

add_footer(s9, "ใช้ Hardware PWM แทน pigpio เนื่องจากเข้ากันได้สมบูรณ์กับระบบปฏิบัติการ Debian 13 (Bookworm) รุ่นใหม่")

# ==============================================================================
# SLIDE 10: ตัวอย่างข้อความและการทดสอบจริง (Verification Log)
# ==============================================================================
s10 = prs.slides.add_slide(blank_layout)
set_bg(s10, COLOR_LIGHT_BG)
add_header(s10, "ตัวอย่างข้อความและการทดสอบจริง")

col_w_10 = [Inches(3.4), Inches(2.3), Inches(4.3), Inches(1.5)]
tbl_10 = create_table(s10, 8, 4, Inches(0.9), Inches(1.6), Inches(11.5), Inches(4.8), col_w_10)

headers_10 = ["ข้อความคำสั่ง", "ทิศทาง", "ความหมาย", "สถานะการทดสอบ"]
for c_idx, h in enumerate(headers_10):
    style_cell(tbl_10.cell(0, c_idx), h, bold=True, font_size=10.5, bg_color=COLOR_TH_BG)

test_rows = [
    ("DRIVE,101,0.50,0.00,1", "PICO ➔ Bridge ➔ RoverC", "เดินหน้าครึ่งความเร็ว (Speed 15)", "✔ ผ่านบนหุ่นจริง"),
    ("DRIVE,102,0.00,0.00,1,0.70", "PICO ➔ Bridge ➔ RoverC", "สไลด์ขวา Mecanum Strafe (แกน 6)", "✔ ผ่านบนหุ่นจริง"),
    ("DRIVE,103,0.00,0.00,1", "Bridge ➔ RoverC", "หยุด เมื่อปล่อย Grip หรือหลุด 300ms", "✔ Failsafe สำเร็จ"),
    ("{\"pan\": 30.0, \"tilt\": -10.0}", "PICO ➔ Pi (control.py)", "หันขวา 30° และเงยขึ้น 10°", "✔ ผ่านบนหุ่นจริง"),
    ("{\"pan\": 70.0, \"tilt\": 0.0}", "PICO ➔ Pi (control.py)", "หันสุดขอบ 70° (Boundary Trigger)", "✔ เสียง + สั่นเตือน"),
    ("STATUS,1,0.00,105", "RoverC Bridge ➔ เว็บ", "แรงดันแบต 0.00V, ตอบรับคำสั่ง 105", "✔ วัด Ping ได้"),
    ("WHEP /cam/whep", "Pi (MediaMTX) ➔ PICO", "สตรีมภาพ WebRTC H.264 อัตโนมัติ", "✔ ภาพออกคมชัด")
]
for r_idx, row in enumerate(test_rows, start=1):
    bg_c = COLOR_ROW_ALT if r_idx % 2 == 1 else COLOR_WHITE
    for c_idx, val in enumerate(row):
        is_status = (c_idx == 3)
        style_cell(tbl_10.cell(r_idx, c_idx), val, bold=(c_idx==0 or is_status), font_size=9.5,
                   font_color=COLOR_GREEN_CARD if is_status else COLOR_DARK_TEXT, bg_color=bg_c)

add_footer(s10, "ผ่านการทดสอบทั้งบน Mock Server จำลอง และบนชุดทดสอบฮาร์ดแวร์จริง PICO 4 + RoverC + Raspberry Pi 4")

# ==============================================================================
# SLIDE 11: ความคืบหน้าและขั้นต่อไป (3-Column Minimal Cards)
# ==============================================================================
s11 = prs.slides.add_slide(blank_layout)
set_bg(s11, COLOR_DARK_BG)

# Title on Dark Background
tb11 = s11.shapes.add_textbox(Inches(0.9), Inches(0.7), Inches(11.5), Inches(0.8))
tf11 = tb11.text_frame; tf11.margin_left = tf11.margin_top = 0
p11 = tf11.paragraphs[0]; p11.text = "ความคืบหน้าและขั้นต่อไป"; p11.font.name = FONT_THAI
p11.font.size = Pt(26); p11.font.bold = True; p11.font.color.rgb = COLOR_WHITE

col_cards = [
    ("เสร็จแล้ว", COLOR_GREEN_CARD,
     ["• PICO 4 ขับ RoverC ผ่าน Bridge (PR #6)",
      "• ระบบล้อ Mecanum: เดินหน้า/สไลด์/หมุน",
      "• กล้อง Pan/Tilt สตรีมสด WebRTC (PR #7)",
      "• หันตามหัวผู้สวม HMD ผ่าน WebXR",
      "• ระบบเตือนสุดขอบ และ Hardware PWM",
      "• Test suite vitest 77/77 tests ผ่าน 100%"]),
    
    ("ขั้นต่อไป", COLOR_BLUE_CARD,
     ["• ดึงฟีด WebRTC เข้าสู่หน้าหลัก VEIL UI",
      "• ปลดล็อกปุ่ม ENTER LIVE VR บน Lobby",
      "• ส่งคำสั่ง HEAD ควบคู่กับ DRIVE ใน UI เดียว",
      "• ออกแบบแท่นยึด Pi + RoverC เป็นโครงเดียวกัน",
      "• ทดสอบขับขี่และหมุนกล้องพร้อมกันภาคสนาม",
      "• ต่อบอร์ดเซนเซอร์วัดแรงดันแบตเตอรี่จริง"]),
    
    ("ต้องตัดสินใจ", COLOR_YELLOW_CARD,
     ["• ทีม approve การเพิ่มฟิลด์ที่ 6 ใน protocol.md",
      "• Custom Firmware สำหรับรับความเร็วแยกล้อ",
      "• การเลือกรุ่นกล้อง (NoIR สำหรับพื้นที่มืด)",
      "• รูปแบบการจ่ายพลังงาน LiPo กลางของตัวรถ",
      "• นโยบาย Fallback เมื่อเครือข่าย Wi-Fi หลุด"])
]

w_card = Inches(3.64)
gap_card = Inches(0.28)
left_base = Inches(0.9)

for idx, (head_t, accent_c, bullets) in enumerate(col_cards):
    x_c = left_base + idx * (w_card + gap_card)
    card_shape = s11.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x_c, Inches(1.8), w_card, Inches(4.8))
    card_shape.fill.solid(); card_shape.fill.fore_color.rgb = COLOR_CARD_DARK
    card_shape.line.color.rgb = accent_c; card_shape.line.width = Pt(1.5)
    
    tf = card_shape.text_frame; tf.margin_left = Inches(0.25); tf.margin_top = Inches(0.25)
    p_h = tf.paragraphs[0]; p_h.text = head_t; p_h.font.bold = True; p_h.font.size = Pt(16); p_h.font.color.rgb = accent_c
    
    for bullet in bullets:
        p_b = tf.add_paragraph(); p_b.text = bullet; p_b.font.size = Pt(10.5); p_b.font.color.rgb = RGBColor(230, 235, 235); p_b.space_before = Pt(8)

# Footer on Dark Slide
tb_f11 = s11.shapes.add_textbox(Inches(0.9), Inches(6.8), Inches(11.5), Inches(0.4))
tf_f11 = tb_f11.text_frame; p_f11 = tf_f11.paragraphs[0]
p_f11.text = "โปรเจกต์ CN360 · ผสานเทคโนโลยี WebXR, WebRTC และ Teleoperation เพื่อสำรวจพื้นที่แคบอย่างสมบูรณ์แบบ"
p_f11.font.name = FONT_THAI; p_f11.font.size = Pt(10); p_f11.font.color.rgb = RGBColor(120, 140, 135)

# Save Final Template Presentation
output_file = "CN360_Progress_Presentation_v2.pptx"
prs.save(output_file)
print(f"Successfully generated {output_file} conforming to reference minimal template style.")
