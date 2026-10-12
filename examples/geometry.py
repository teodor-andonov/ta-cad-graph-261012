"""This is intentionally illustrative, not CAD-engine-specific."""
from parameters import wall_width, wall_height, wall_thickness
from parameters import window_width, window_height, sill_height


def make_wall(width, height, thickness):
    face = Rectangle(width, height)
    body = Extrude(face, thickness)
    return body


def make_opening(width, height, sill, wall_depth):
    profile = Rectangle(width, height)
    raised = Translate(profile, y=sill)
    void = Extrude(raised, wall_depth)
    return void


wall = make_wall(wall_width, wall_height, wall_thickness)
opening = make_opening(window_width, window_height, sill_height, wall_thickness)
result = Subtract(wall, opening)
