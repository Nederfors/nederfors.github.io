#!/usr/bin/env python3

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent.parent
GROUPS = ("manager", "wiring", "coverage", "css", "legacy")
POPUP_RELATED_HTML_SIGNALS = (
    "js/inventory-utils.js",
    "js/shared-toolbar.js",
    "js/tabell-popup.js",
    "js/choice-popup.js",
    "js/main.js",
    "js/app-bootstrap.js",
    "<shared-toolbar",
)
SW_REQUIRED_ASSETS = (
    "js/popup-manager.js",
    "js/shared-toolbar.js",
    "js/main.js",
    "js/inventory-utils.js",
    "js/choice-popup.js",
    "js/tabell-popup.js",
    "js/elite-add.js",
    "css/style.css",
)
LEGACY_POPUP_IDS = (
    "artifactPaymentPopup",
    "traitPopup",
    "maskPopup",
    "powerPopup",
    "beastPopup",
    "bloodPopup",
    "monsterPopup",
)
DRIFT_GUARD_FILES = (
    "js/choice-popup.js",
    "js/tabell-popup.js",
    "js/elite-add.js",
    "js/pdf-library.js",
    "js/main.js",
    "js/inventory-utils.js",
    "js/shared-toolbar.js",
)
ALLOWED_BLUR_SELECTOR_FRAGMENTS = (
    ".info-tab-header",
    "#infoPanel",
    "#filterPanel",
    "#summarySlidePanel",
    "#conflictPanel",
    "#yrkePanel",
)


class Reporter:
    def __init__(self, groups):
        self.groups = groups
        self.data = {group: {"pass": [], "fail": []} for group in groups}

    def add_pass(self, group, message, path=None, line=None):
        self.data[group]["pass"].append((message, path, line))

    def add_fail(self, group, message, path=None, line=None):
        self.data[group]["fail"].append((message, path, line))

    def failed(self):
        return any(self.data[group]["fail"] for group in self.groups)

    def print_report(self):
        for group in self.groups:
            print(f"[{group}]")
            entries = self.data[group]["pass"] + self.data[group]["fail"]
            if not entries:
                print("PASS no checks ran")
                print()
                continue
            for message, path, line in self.data[group]["pass"]:
                print(format_entry("PASS", message, path, line))
            for message, path, line in self.data[group]["fail"]:
                print(format_entry("FAIL", message, path, line))
            print()

        failed_groups = [group for group in self.groups if self.data[group]["fail"]]
        status = "FAIL" if failed_groups else "PASS"
        if failed_groups:
            print(f"{status} {len(failed_groups)} group(s) failed: {', '.join(failed_groups)}")
        else:
            print(f"{status} {len(self.groups)} group(s) passed")


def format_entry(prefix, message, path=None, line=None):
    location = ""
    if path:
        location = f" ({rel_path(path)}"
        if line:
            location += f":{line}"
        location += ")"
    return f"{prefix} {message}{location}"


def rel_path(path):
    return Path(path).resolve().relative_to(ROOT).as_posix()


def read_text(relative_path):
    path = ROOT / relative_path
    return path.read_text(encoding="utf-8"), path


def line_for_index(text, index):
    return text.count("\n", 0, index) + 1


def line_for_substring(text, needle):
    index = text.find(needle)
    if index < 0:
        return None
    return line_for_index(text, index)


def line_for_regex(text, pattern):
    match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    if not match:
        return None
    return line_for_index(text, match.start())


def extract_object_body(text, anchor):
    start = text.find(anchor)
    if start < 0:
        return None, None
    open_index = text.find("{", start)
    if open_index < 0:
        return None, None

    depth = 0
    in_string = None
    escaped = False
    for index in range(open_index, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue

        if char in ("'", '"'):
            in_string = char
            continue
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return text[open_index + 1:index], open_index

    return None, None


def ensure_regex(reporter, group, text, pattern, message, path, action):
    line = line_for_regex(text, pattern)
    if line is None:
        reporter.add_fail(group, f"{message}; {action}", path, 1)
        return False
    reporter.add_pass(group, message, path, line)
    return True


def ensure_substring(reporter, group, text, needle, message, path, action):
    line = line_for_substring(text, needle)
    if line is None:
        reporter.add_fail(group, f"{message}; {action}", path, 1)
        return False
    reporter.add_pass(group, message, path, line)
    return True


def scope_from_anchor(text, anchor, span=3200):
    start = text.find(anchor)
    if start < 0:
        return None, None
    return text[start:start + span], start


def verify_manager(reporter):
    text, path = read_text("js/popup-manager.js")

    export_body, export_index = extract_object_body(text, "window.popupManager =")
    if export_body is None:
        reporter.add_fail(
            "manager",
            "popupManager export object is missing; restore window.popupManager assignment",
            path,
            1,
        )
    else:
        missing = [
            name for name in
            ("register", "registerMany", "open", "close", "closeTop", "observeRoot", "unobserveRoot")
            if re.search(rf"\b{name}\b", export_body) is None
        ]
        if missing:
            reporter.add_fail(
                "manager",
                f"popupManager export is missing API: {', '.join(missing)}; restore the full manager surface",
                path,
                line_for_index(text, export_index),
            )
        else:
            reporter.add_pass(
                "manager",
                "popupManager exports the expected API surface",
                path,
                line_for_index(text, export_index),
            )

    for popup_type in ("dialog", "picker", "form", "hub"):
        pattern = (
            rf"{popup_type}\s*:\s*Object\.freeze\(\s*{{\s*backdrop\s*:\s*true\s*,\s*escape\s*:\s*true\s*}}"
        )
        ensure_regex(
            reporter,
            "manager",
            text,
            pattern,
            f"TYPE_DEFAULTS enables backdrop+escape for '{popup_type}'",
            path,
            f"restore TYPE_DEFAULTS['{popup_type}'] to Object.freeze({{ backdrop: true, escape: true }})",
        )

    ensure_substring(
        reporter,
        "manager",
        text,
        "document.addEventListener('keydown', onGlobalKeydown, true);",
        "Global Escape listener is registered",
        path,
        "restore the capture-phase keydown listener in popup-manager.js",
    )
    ensure_substring(
        reporter,
        "manager",
        text,
        "document.addEventListener('click', onGlobalClick, true);",
        "Global click-out listener is registered",
        path,
        "restore the capture-phase click listener in popup-manager.js",
    )
    ensure_substring(
        reporter,
        "manager",
        text,
        "const inner = pop.querySelector('.popup-inner');",
        "Click-out logic checks .popup-inner",
        path,
        "restore .popup-inner detection in onGlobalClick()",
    )
    ensure_substring(
        reporter,
        "manager",
        text,
        "close(top.id, 'backdrop');",
        "Click-out logic closes with reason 'backdrop'",
        path,
        "restore close(top.id, 'backdrop') in onGlobalClick()",
    )
    ensure_substring(
        reporter,
        "manager",
        text,
        "window.registerOverlayCleanup(el, () => close(id, 'history'))",
        "popupManager.open() registers history cleanup",
        path,
        "restore registerOverlayCleanup(el, () => close(id, 'history')) in open()",
    )
    ensure_substring(
        reporter,
        "manager",
        text,
        "window.registerOverlayCleanup(el, null)",
        "runSessionClose() clears registered cleanup hooks",
        path,
        "restore registerOverlayCleanup(el, null) in runSessionClose()",
    )


def verify_wiring(reporter):
    bootstrap_text, bootstrap_path = read_text("js/app-bootstrap.js")
    sw_text, sw_path = read_text("sw.js")
    toolbar_text, toolbar_path = read_text("js/shared-toolbar.js")

    html_paths = sorted(ROOT.glob("*.html"))
    popup_pages = []
    for path in html_paths:
        text = path.read_text(encoding="utf-8")
        if any(signal in text for signal in POPUP_RELATED_HTML_SIGNALS):
            popup_pages.append((path, text))

    for path, text in popup_pages:
        if "js/popup-manager.js" not in text:
            missing_line = 1
            for signal in POPUP_RELATED_HTML_SIGNALS:
                hit = line_for_substring(text, signal)
                if hit:
                    missing_line = hit
                    break
            reporter.add_fail(
                "wiring",
                "HTML entrypoint loads popup-related UI but misses js/popup-manager.js; add the manager script before popup consumers",
                path,
                missing_line,
            )
        else:
            reporter.add_pass(
                "wiring",
                "HTML entrypoint includes js/popup-manager.js",
                path,
                line_for_substring(text, "js/popup-manager.js"),
            )

    ensure_substring(
        reporter,
        "wiring",
        bootstrap_text,
        "'js/popup-manager.js'",
        "Bootstrap script list includes js/popup-manager.js",
        bootstrap_path,
        "restore js/popup-manager.js in CORE_SCRIPTS",
    )

    for asset in SW_REQUIRED_ASSETS:
        ensure_substring(
            reporter,
            "wiring",
            sw_text,
            f"'{asset}'",
            f"Service worker precache includes {asset}",
            sw_path,
            f"restore '{asset}' to URLS_TO_CACHE in sw.js",
        )

    ensure_substring(
        reporter,
        "wiring",
        toolbar_text,
        "manager.observeRoot?.(this.shadowRoot);",
        "shared-toolbar binds popupManager.observeRoot(this.shadowRoot)",
        toolbar_path,
        "restore manager.observeRoot?.(this.shadowRoot) in bindPopupManager()",
    )
    ensure_substring(
        reporter,
        "wiring",
        toolbar_text,
        "manager.registerMany?.(registrations);",
        "shared-toolbar registers typed toolbar popups with registerMany()",
        toolbar_path,
        "restore manager.registerMany?.(registrations) in bindPopupManager()",
    )


def verify_coverage(reporter):
    toolbar_text, toolbar_path = read_text("js/shared-toolbar.js")
    map_body, map_index = extract_object_body(toolbar_text, "const POPUP_TYPE_BY_ID = Object.freeze(")
    if map_body is None:
        reporter.add_fail(
            "coverage",
            "POPUP_TYPE_BY_ID is missing; restore toolbar popup type registration",
            toolbar_path,
            1,
        )
        popup_type_map = {}
    else:
        popup_type_map = dict(re.findall(r"^\s*([A-Za-z0-9_-]+Popup)\s*:\s*'([a-z]+)'", map_body, re.MULTILINE))
        if not popup_type_map:
            reporter.add_fail(
                "coverage",
                "POPUP_TYPE_BY_ID could not be parsed; keep toolbar popup type keys as simple string literals",
                toolbar_path,
                line_for_index(toolbar_text, map_index),
            )
        else:
            reporter.add_pass(
                "coverage",
                "POPUP_TYPE_BY_ID parsed successfully",
                toolbar_path,
                line_for_index(toolbar_text, map_index),
            )

    rendered_popup_ids = sorted(set(re.findall(r'id="([A-Za-z0-9_-]+Popup)"', toolbar_text)))
    for popup_id in rendered_popup_ids:
        if popup_id not in popup_type_map:
            reporter.add_fail(
                "coverage",
                f'toolbar popup "{popup_id}" is rendered but missing from POPUP_TYPE_BY_ID; add a type mapping',
                toolbar_path,
                line_for_substring(toolbar_text, f'id="{popup_id}"'),
            )
        else:
            reporter.add_pass(
                "coverage",
                f'toolbar popup "{popup_id}" has a type mapping',
                toolbar_path,
                line_for_substring(toolbar_text, f'id="{popup_id}"'),
            )

    for popup_id in sorted(popup_type_map):
        if popup_id not in rendered_popup_ids:
            reporter.add_fail(
                "coverage",
                f'toolbar popup "{popup_id}" is mapped in POPUP_TYPE_BY_ID but no longer rendered; remove the stale type mapping',
                toolbar_path,
                line_for_substring(toolbar_text, f"{popup_id}:"),
            )

    dynamic_checks = (
        (
            "choicePopup",
            "js/choice-popup.js",
            r"window\.popupManager\.open\(pop,\s*{\s*type\s*:\s*'picker'",
            "choicePopup opens through popupManager as a picker",
            "route choicePopup through window.popupManager.open(..., { type: 'picker' })",
        ),
        (
            "tabellPopup",
            "js/tabell-popup.js",
            r"openSession\(pop,\s*{\s*type\s*:\s*'picker'",
            "tabellPopup uses a picker manager session",
            "route tabellPopup through a picker session before any fallback class toggling",
        ),
        (
            "masterPopup",
            "js/elite-add.js",
            r"window\.popupManager\.open\(pop,\s*{\s*type\s*:\s*'picker'",
            "masterPopup opens through popupManager as a picker",
            "route masterPopup through window.popupManager.open(..., { type: 'picker' })",
        ),
    )

    for popup_id, relative_path, pattern, success_message, action in dynamic_checks:
        text, path = read_text(relative_path)
        line = line_for_regex(text, pattern)
        if line is None:
            reporter.add_fail(
                "coverage",
                f'{popup_id} is no longer manager-backed with the expected type; {action}',
                path,
                1,
            )
        else:
            reporter.add_pass("coverage", success_message, path, line)

    main_text, main_path = read_text("js/main.js")
    char_scope, char_scope_offset = scope_from_anchor(main_text, "async function requireCharacter()")
    if char_scope is None:
        reporter.add_fail(
            "coverage",
            "requireCharacter() is missing; restore the charPopup flow or update the verifier",
            main_path,
            1,
        )
    else:
        match = re.search(r"createPopupSession\(pop,\s*{\s*type\s*:\s*'dialog'", char_scope, re.MULTILINE | re.DOTALL)
        if not match:
            reporter.add_fail(
                "coverage",
                "charPopup is no longer manager-backed as a dialog; route requireCharacter() through createPopupSession(..., { type: 'dialog' })",
                main_path,
                line_for_index(main_text, char_scope_offset),
            )
        else:
            reporter.add_pass(
                "coverage",
                "charPopup uses a dialog manager session via createPopupSession()",
                main_path,
                line_for_index(char_scope, match.start()) + line_for_index(main_text, char_scope_offset) - 1,
            )

    session_checks = (
        ("js/main.js", "main.js createPopupSession() prioritizes popupManager and keeps class toggling as fallback"),
        ("js/inventory-utils.js", "inventory-utils createPopupSession() prioritizes popupManager and keeps class toggling as fallback"),
    )
    for relative_path, success_message in session_checks:
        text, path = read_text(relative_path)
        required_snippets = (
            "if (popupManager?.open && target?.id) {",
            "popupManager.open(target, { type, dismissPolicy: options.dismissPolicy, onClose: finalize });",
            "} else if (target) {",
            "target.classList.add('open');",
            "if (popupManager?.close && target?.id) {",
            "popupManager.close(target, reason);",
            "if (target) target.classList.remove('open');",
        )
        missing = [snippet for snippet in required_snippets if snippet not in text]
        if missing:
            reporter.add_fail(
                "coverage",
                f"{Path(relative_path).name} createPopupSession() no longer matches the manager-first fallback contract; restore popupManager open/close before classList fallback",
                path,
                line_for_substring(text, "function createPopupSession(") or 1,
            )
        else:
            reporter.add_pass(
                "coverage",
                success_message,
                path,
                line_for_substring(text, "function createPopupSession("),
            )

    for relative_path in DRIFT_GUARD_FILES:
        text, path = read_text(relative_path)
        has_direct_toggle = (
            "classList.add('open')" in text or
            "classList.remove('open')" in text
        )
        if not has_direct_toggle:
            reporter.add_pass(
                "coverage",
                f"{Path(relative_path).name} has no direct open-class toggles to guard",
                path,
                1,
            )
            continue
        if "popupManager.open" not in text or "popupManager.close" not in text:
            toggle_line = (
                line_for_substring(text, "classList.add('open')")
                or line_for_substring(text, "classList.remove('open')")
                or 1
            )
            reporter.add_fail(
                "coverage",
                f"{Path(relative_path).name} toggles .open directly without local popupManager.open/close coverage; route the popup flow back through the manager or keep the fallback beside it",
                path,
                toggle_line,
            )
        else:
            reporter.add_pass(
                "coverage",
                f"{Path(relative_path).name} keeps direct .open toggles guarded by popupManager coverage",
                path,
                line_for_substring(text, "popupManager.open") or line_for_substring(text, "popupManager.close"),
            )


def extract_css_rule_selector(text, declaration_index):
    open_index = text.rfind("{", 0, declaration_index)
    if open_index < 0:
        return None
    close_index = text.rfind("}", 0, open_index)
    selector = text[close_index + 1:open_index].strip()
    return selector or None


def verify_popup_background_rule(reporter, css_text, css_path, selector_pattern, label):
    match = re.search(selector_pattern, css_text, re.MULTILINE | re.DOTALL)
    if not match:
        reporter.add_fail(
            "css",
            f"{label} is missing; restore the popup shade background rule",
            css_path,
            1,
        )
        return
    body = match.group("body")
    if "var(--popup-backdrop-shade)" not in body:
        reporter.add_fail(
            "css",
            f"{label} no longer uses var(--popup-backdrop-shade); restore the shared popup shade token",
            css_path,
            line_for_index(css_text, match.start()),
        )
        return
    reporter.add_pass(
        "css",
        f"{label} uses the shared popup shade token",
        css_path,
        line_for_index(css_text, match.start()),
    )


def verify_css(reporter):
    text, path = read_text("css/style.css")

    ensure_regex(
        reporter,
        "css",
        text,
        r"--popup-backdrop-shade\s*:\s*[^;]+;",
        "Popup shade token exists",
        path,
        "restore --popup-backdrop-shade in css/style.css",
    )

    blur_matches = list(re.finditer(r"backdrop-filter\s*:", text))
    if not blur_matches:
        reporter.add_fail(
            "css",
            "No backdrop-filter rules were found; keep non-popup panel blur rules and remove popup blur only",
            path,
            1,
        )
    for match in blur_matches:
        selector = extract_css_rule_selector(text, match.start()) or "<unknown selector>"
        selector_line = line_for_index(text, match.start())
        if re.search(r"\.popup\b|[A-Za-z0-9_-]+Popup\b", selector):
            reporter.add_fail(
                "css",
                f"Popup selector still uses backdrop-filter: {selector}; remove popup blur and keep only shade",
                path,
                selector_line,
            )
            continue
        if not any(fragment in selector for fragment in ALLOWED_BLUR_SELECTOR_FRAGMENTS):
            reporter.add_fail(
                "css",
                f"Unexpected non-popup backdrop-filter rule found: {selector}; keep blur limited to info/filter panel UI",
                path,
                selector_line,
            )
            continue
        reporter.add_pass(
            "css",
            f"Non-popup blur rule remains scoped to panel UI: {selector}",
            path,
            selector_line,
        )

    verify_popup_background_rule(
        reporter,
        text,
        path,
        r"\.popup\s*{(?P<body>[\s\S]*?)}",
        "Generic .popup backdrop rule",
    )
    verify_popup_background_rule(
        reporter,
        text,
        path,
        r"#tabellPopup\s*{(?P<body>[\s\S]*?)}",
        "#tabellPopup backdrop rule",
    )
    verify_popup_background_rule(
        reporter,
        text,
        path,
        r"#choicePopup\.popup\.picker-popup\s*{(?P<body>[\s\S]*?)}",
        "#choicePopup backdrop rule",
    )
    verify_popup_background_rule(
        reporter,
        text,
        path,
        r"#qualPopup\s*,\s*#rowPricePopup\s*,\s*#buyMultiplePopup\s*,\s*#vehicleQtyPopup\s*,\s*#vehicleMoneyPopup\s*,\s*#deleteContainerPopup\s*,\s*#saveFreePopup\s*,\s*#advMoneyPopup\s*{(?P<body>[\s\S]*?)}",
        "Picker/dialog popup backdrop rule cluster",
    )


def verify_legacy(reporter):
    search_paths = sorted(
        list(ROOT.glob("*.html")) +
        list((ROOT / "js").glob("*.js")) +
        list((ROOT / "css").glob("*.css"))
    )

    for legacy_id in LEGACY_POPUP_IDS:
        found = False
        for path in search_paths:
            text = path.read_text(encoding="utf-8")
            line = line_for_substring(text, legacy_id)
            if line:
                reporter.add_fail(
                    "legacy",
                    f'Legacy popup id "{legacy_id}" is still present; remove dead popup selectors and guards',
                    path,
                    line,
                )
                found = True
                break
        if not found:
            reporter.add_pass(
                "legacy",
                f'Legacy popup id "{legacy_id}" is absent from HTML/CSS/JS',
                ROOT / "js/popup-manager.js",
                1,
            )

    toolbar_text, toolbar_path = read_text("js/shared-toolbar.js")
    generic_detection_patterns = (
        "el.classList?.contains('popup')",
        "el.classList?.contains('offcanvas')",
        "const hasOverlayInPath = path.some(",
    )
    missing = [snippet for snippet in generic_detection_patterns if snippet not in toolbar_text]
    if missing:
        reporter.add_fail(
            "legacy",
            "shared-toolbar outside-click logic is no longer using generic .popup/.offcanvas path detection; restore hasOverlayInPath generic overlay checks",
            toolbar_path,
            line_for_substring(toolbar_text, "handleClick(e)") or 1,
        )
    else:
        reporter.add_pass(
            "legacy",
            "shared-toolbar outside-click logic uses generic .popup/.offcanvas path detection",
            toolbar_path,
            line_for_substring(toolbar_text, "const hasOverlayInPath = path.some("),
        )


def parse_args(argv):
    if not argv:
        return list(GROUPS)
    if len(argv) == 2 and argv[0] == "--group" and argv[1] in GROUPS:
        return [argv[1]]
    print("Usage: python3 scripts/verify_popup_system.py [--group manager|wiring|coverage|css|legacy]", file=sys.stderr)
    raise SystemExit(2)


def main(argv):
    selected_groups = parse_args(argv)
    reporter = Reporter(selected_groups)

    runners = {
        "manager": verify_manager,
        "wiring": verify_wiring,
        "coverage": verify_coverage,
        "css": verify_css,
        "legacy": verify_legacy,
    }

    for group in selected_groups:
        runners[group](reporter)

    reporter.print_report()
    return 1 if reporter.failed() else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
