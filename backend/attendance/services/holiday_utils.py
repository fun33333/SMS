from __future__ import annotations

from typing import Iterable, Optional, Set

from classes.models import Grade, Level


SHIFT_SYNONYMS = {
    None: None,
    "": None,
    "all": "both",
}


def normalize_shift_value(value: Optional[str]) -> Optional[str]:
    normalized = (value or "").strip().lower()
    if normalized in SHIFT_SYNONYMS:
        normalized = SHIFT_SYNONYMS[normalized]
    return normalized or None


def resolve_allowed_shifts(selected_shift: Optional[str]) -> Optional[Set[str]]:
    normalized = normalize_shift_value(selected_shift)
    if not normalized:
        return None
    if normalized == "both":
        return {"morning", "afternoon"}
    return {normalized}


def is_level_shift_allowed(level_shift: Optional[str], allowed: Optional[Set[str]]) -> bool:
    if not allowed:
        return True
    normalized = normalize_shift_value(level_shift)
    if normalized == "both":
        return bool({"morning", "afternoon"} & allowed)
    return normalized in allowed


def validate_levels_for_shift(levels: Iterable[Level], allowed_shifts: Optional[Set[str]]):
    if not allowed_shifts:
        return
    invalid_levels = [
        level for level in levels if not is_level_shift_allowed(level.shift, allowed_shifts)
    ]
    if invalid_levels:
        names = ", ".join(f"{level.name} ({level.shift})" for level in invalid_levels)
        raise ValueError(f"Selected levels are not available for the chosen shift: {names}")


def validate_grades_for_levels(grades: Iterable[Grade], allowed_levels: Iterable[Level]):
    allowed_level_ids = {level.id for level in allowed_levels}
    invalid_grades = [grade for grade in grades if grade.level_id not in allowed_level_ids]
    if invalid_grades:
        names = ", ".join(f"{grade.name} ({grade.level.name})" for grade in invalid_grades)
        raise ValueError(f"Selected grades do not belong to the chosen levels: {names}")


def collect_shifts_from_levels(levels: Iterable[Level]) -> Set[str]:
    return {
        shift
        for level in levels
        if (shift := normalize_shift_value(getattr(level, "shift", None)))
    }

