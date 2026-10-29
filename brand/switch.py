# LAUNCHCODE's object: a missile-style arming switch. A brushed black steel plate, a chrome toggle in the ARMED
# position, a red flip cover lifted open on its hinge, a red LED lit, engraved ARM marks.
# blender -b --factory-startup --python brand/switch.py -- still|cutout|turn <out> [samples] [res] [frames]
import bpy, math, sys, os
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "still"
OUT = os.path.abspath(argv[1]) if len(argv) > 1 else os.path.abspath("switch.png")
SAMPLES = int(argv[2]) if len(argv) > 2 else 256
RES = int(argv[3]) if len(argv) > 3 else 1500
FRAMES = int(argv[4]) if len(argv) > 4 else 72
START = int(argv[5]) if len(argv) > 5 else 0
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
sc = bpy.context.scene

def P(m): return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
def mat(name, color, rough=0.4, metal=0.0, coat=0.0, emit=None, strength=0.0, trans=0.0, ior=1.45):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = P(m)
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    c = b.inputs.get("Coat Weight") or b.inputs.get("Clearcoat")
    if c: c.default_value = coat
    if emit:
        k = "Emission Color" if "Emission Color" in b.inputs else "Emission"
        b.inputs[k].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = strength
    if trans:
        t = b.inputs.get("Transmission Weight") or b.inputs.get("Transmission"); t.default_value = trans
        b.inputs["IOR"].default_value = ior
    return m

# brushed black steel: anisotropic streaks from stretched noise
plate = mat("plate", (0.03, 0.03, 0.033), 0.3, 1.0)
nt = plate.node_tree; b = P(plate)
tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (2, 160, 2)
nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 6; nz.inputs["Detail"].default_value = 12
nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = 0.22; mr.inputs["To Max"].default_value = 0.42
nt.links.new(nz.outputs["Fac"], mr.inputs["Value"]); nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])
bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.04; nt.links.new(nz.outputs["Fac"], bp.inputs["Height"]); nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
if "Anisotropic" in b.inputs: b.inputs["Anisotropic"].default_value = 0.7

chrome = mat("chrome", (0.9, 0.9, 0.92), 0.08, 1.0)
red = mat("red", (0.75, 0.02, 0.015), 0.12, 0.0, coat=1.0, trans=0.35)
redSolid = mat("redSolid", (0.55, 0.012, 0.01), 0.3, 0.0, coat=0.6)
black = mat("black", (0.012, 0.012, 0.014), 0.45)
led = mat("led", (1.0, 0.05, 0.02), 0.2, emit=(1.0, 0.03, 0.01), strength=9)
paint = mat("paint", (0.85, 0.82, 0.76), 0.5)           # engraved white fill
amber = mat("amber", (1.0, 0.55, 0.05), 0.4, emit=(1.0, 0.45, 0.03), strength=6)

def rbox(name, size, loc, m, bev=0.02, seg=5, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    md = o.modifiers.new("b", "BEVEL"); md.width = bev; md.segments = seg; md.limit_method = "ANGLE"
    try: md.harden_normals = True
    except Exception: pass
    o.data.materials.append(m); bpy.ops.object.shade_smooth()
    try: bpy.ops.object.shade_auto_smooth()
    except Exception: pass
    return o
def cyl(name, r, d, loc, m, rot=(0, 0, 0), v=64):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, rotation=rot, vertices=v); o = bpy.context.active_object; o.name = name
    o.data.materials.append(m); bpy.ops.object.shade_smooth(); return o

parts = []
# the plate (faces +z), four hex screws
parts.append(rbox("plate", (2.2, 2.2, 0.16), (0, 0, -0.08), plate, 0.05, 6))
for sx in (-1, 1):
    for sy in (-1, 1):
        parts.append(cyl("screw", 0.07, 0.04, (sx * 0.92, sy * 0.92, 0.02), chrome, v=6))
# the switch housing: a raised black block with a guard collar
parts.append(rbox("housing", (0.72, 1.1, 0.22), (0, 0.05, 0.11), black, 0.06, 6))
parts.append(cyl("collar", 0.16, 0.08, (0, -0.1, 0.25), chrome))
# the toggle: chrome lever tilted forward (armed), a knurled tip
lev = cyl("lever", 0.045, 0.55, (0, -0.1, 0.5), chrome, rot=(math.radians(-28), 0, 0)); parts.append(lev)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07, location=(0, -0.1 - 0.26 * math.sin(math.radians(28)), 0.25 + 0.5 * math.cos(math.radians(28)) * 1.0)); tip = bpy.context.active_object
tip.data.materials.append(chrome); bpy.ops.object.shade_smooth(); parts.append(tip)
# the red flip cover: hinged at the back edge, lifted open about 100 degrees
cover = rbox("cover", (0.8, 1.05, 0.34), (0, 0, 0), red, 0.08, 8)
md = cover.modifiers.new("shell", "SOLIDIFY"); md.thickness = 0.03; md.offset = 0
# hollow it: delete the bottom face by booleaning a slightly smaller box
inner = rbox("inner", (0.74, 0.99, 0.34), (0, 0, -0.04), red, 0.06, 4)
bo = cover.modifiers.new("hollow", "BOOLEAN"); bo.object = inner; bo.operation = "DIFFERENCE"; inner.hide_render = True; inner.hide_viewport = True
bpy.ops.object.empty_add(location=(0, 0.58, 0.24)); hinge = bpy.context.active_object
cover.parent = hinge; cover.location = (0, -0.52, 0.05)
hinge.rotation_euler = (math.radians(-104), 0, 0)
parts.append(cover)
parts.append(cyl("hingePin", 0.035, 0.9, (0, 0.58, 0.24), chrome, rot=(0, math.radians(90), 0)))
# the LED and its bezel, engraved ARM / SAFE marks
bpy.ops.object.light_add(type="POINT", location=(0.7, -0.55, 0.25)); gl_ = bpy.context.active_object; gl_.data.energy = 6; gl_.data.color = (1, 0.1, 0.05); gl_.data.shadow_soft_size = 0.05; parts.append(gl_)
parts.append(cyl("ledBezel", 0.11, 0.06, (0.7, -0.55, 0.03), chrome))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(0.7, -0.55, 0.06)); l = bpy.context.active_object; l.scale = (1, 1, 0.6); l.data.materials.append(led); bpy.ops.object.shade_smooth(); parts.append(l)
for (txt, loc, size, m) in [("ARM", (-0.62, -0.62, 0.002), 0.17, paint), ("LAUNCH", (0, -0.9, 0.002), 0.13, paint)]:
    bpy.ops.object.text_add(location=loc); t = bpy.context.active_object; t.data.body = txt; t.data.size = size; t.data.align_x = "CENTER"; t.data.extrude = 0.004
    t.data.materials.append(m); parts.append(t)
bpy.ops.object.empty_add(location=(0, 0, 0)); piv = bpy.context.active_object
for o in parts + [hinge]:
    if o.parent is None: o.parent = piv
TILT = Euler((math.radians(52), 0, math.radians(20)))
piv.rotation_euler = TILT

def area(name, loc, size, energy, color=(1, 1, 1), sy=None):
    bpy.ops.object.light_add(type="AREA", location=loc); a = bpy.context.active_object; a.data.energy = energy; a.data.color = color
    a.data.shape = "RECTANGLE"; a.data.size = size; a.data.size_y = sy or size
    a.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); return a
area("key", (-3.5, -3.0, 4.0), 3.0, 700)
area("strip", (1.5, -1.0, 5.0), 6.0, 300, (0.9, 0.95, 1.0), 0.5)
area("rimR", (3.8, 2.4, 1.4), 2.0, 600, (1.0, 0.25, 0.15))
area("rimL", (-3.6, 2.6, 0.8), 2.0, 300, (0.4, 0.6, 1.0))
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
wn = world.node_tree; bg = wn.nodes["Background"]
wtc = wn.nodes.new("ShaderNodeTexCoord"); sep = wn.nodes.new("ShaderNodeSeparateXYZ"); wr = wn.nodes.new("ShaderNodeValToRGB")
wr.color_ramp.elements[0].color = (0.002, 0.002, 0.003, 1); wr.color_ramp.elements[1].position = 0.62; wr.color_ramp.elements[1].color = (0.18, 0.18, 0.2, 1)
wn.links.new(wtc.outputs["Generated"], sep.inputs["Vector"]); wn.links.new(sep.outputs["Z"], wr.inputs["Fac"]); wn.links.new(wr.outputs["Color"], bg.inputs["Color"])

def backdrop():
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 4.5, 0), rotation=(math.radians(90), 0, 0)); pl = bpy.context.active_object
    m = bpy.data.materials.new("bg"); m.use_nodes = True; t = m.node_tree
    for n in list(t.nodes): t.nodes.remove(n)
    o = t.nodes.new("ShaderNodeOutputMaterial"); e = t.nodes.new("ShaderNodeEmission"); c = t.nodes.new("ShaderNodeTexCoord"); g = t.nodes.new("ShaderNodeTexGradient"); g.gradient_type = "SPHERICAL"
    mpp = t.nodes.new("ShaderNodeMapping"); mpp.inputs["Scale"].default_value = (0.12, 0.12, 0.12); r = t.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.elements[0].color = (0.002, 0.0015, 0.0015, 1); r.color_ramp.elements[1].position = 0.97; r.color_ramp.elements[1].color = (0.09, 0.012, 0.008, 1)
    t.links.new(c.outputs["Object"], mpp.inputs["Vector"]); t.links.new(mpp.outputs["Vector"], g.inputs["Vector"]); t.links.new(g.outputs["Fac"], r.inputs["Fac"]); t.links.new(r.outputs["Color"], e.inputs["Color"]); t.links.new(e.outputs["Emission"], o.inputs["Surface"])
    pl.data.materials.append(m)

bpy.ops.object.camera_add(location=(0.05, -7.2, 0.32)); cam = bpy.context.active_object; sc.camera = cam
cam.rotation_euler = (math.radians(90), 0, 0); cam.data.lens = 70

sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for dt in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = dt; prefs.get_devices()
            if any(d.type == dt for d in prefs.devices):
                for d in prefs.devices: d.use = d.type == dt
                sc.cycles.device = "GPU"; break
        except TypeError: pass
except Exception: pass
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.render.image_settings.file_format = "PNG"
try: sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Punchy"
except TypeError: pass
sc.use_nodes = True
try:
    tree = sc.node_tree; rl = tree.nodes.get("Render Layers"); comp = tree.nodes.get("Composite")
    gl = tree.nodes.new("CompositorNodeGlare"); gl.glare_type = "FOG_GLOW"; gl.quality = "HIGH"; gl.threshold = 1.0; gl.size = 7
    try: gl.mix = -0.5
    except Exception: pass
    tree.links.new(rl.outputs["Image"], gl.inputs["Image"]); tree.links.new(gl.outputs["Image"], comp.inputs["Image"])
    if MODE != "still": tree.links.new(rl.outputs["Alpha"], comp.inputs["Alpha"])
except Exception as e: print("no glare", e)

sc.render.resolution_x = sc.render.resolution_y = RES
if MODE == "still":
    backdrop(); sc.render.filepath = OUT; bpy.ops.render.render(write_still=True)
elif MODE == "cutout":
    sc.render.film_transparent = True; sc.render.image_settings.color_mode = "RGBA"; sc.render.filepath = OUT; bpy.ops.render.render(write_still=True)
else:
    # the cover swings open and the LED comes on
    sc.render.film_transparent = True; sc.render.image_settings.color_mode = "RGBA"; os.makedirs(OUT, exist_ok=True)
    lb = P(led)
    for f in range(START, FRAMES):
        p = f / max(1, FRAMES - 1); e = 1 - (1 - p) ** 3
        hinge.rotation_euler = (math.radians(-104 * min(1, e * 1.3)), 0, 0)
        piv.rotation_euler = Euler((TILT.x, 0, TILT.z + math.radians(-14) * (1 - e)))
        lb.inputs["Emission Strength"].default_value = 9 if p > 0.6 else 0.3
        sc.render.filepath = os.path.join(OUT, "s%03d.png" % f); bpy.ops.render.render(write_still=True)
print("done", MODE)
