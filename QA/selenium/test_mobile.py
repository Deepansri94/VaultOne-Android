"""
Mobile Compatibility Test Suite — VaultOne
Device: Pixel 5 emulation (393×851, Android Chrome UA)

Coverage:
  TC-MOB-001  Viewport meta tag present and correct
  TC-MOB-002  Viewport width matches device width (no zoom)
  TC-MOB-003  No horizontal scroll on Home
  TC-MOB-004  Stats grid renders 2-column on mobile (not 4-column)
  TC-MOB-005  Bottom nav is visible and not clipped
  TC-MOB-006  All 6 nav buttons are within viewport width
  TC-MOB-007  Nav buttons meet 44px minimum touch target height
  TC-MOB-008  Home hero section is visible without horizontal scroll
  TC-MOB-009  iVault section loads on mobile — no horizontal overflow
  TC-MOB-010  iVault sub-tabs are horizontally scrollable (overflow-x)
  TC-MOB-011  Family section loads on mobile — no horizontal overflow
  TC-MOB-012  Passwords section loads on mobile — no horizontal overflow
  TC-MOB-013  Reminders section loads on mobile — no horizontal overflow
  TC-MOB-014  Settings section loads on mobile — no horizontal overflow
  TC-MOB-015  Sheet/modal width does not exceed viewport width
  TC-MOB-016  Sheet/modal max-height does not exceed viewport height
  TC-MOB-017  Add Password button is tappable on mobile
  TC-MOB-018  Add Person button is tappable on mobile
  TC-MOB-019  iVault sub-tab buttons are tappable on mobile
  TC-MOB-020  Bottom nav navigates correctly on mobile (all 6 sections)
  TC-MOB-021  Content padding is applied on mobile (no edge-to-edge overflow)
  TC-MOB-022  Item cards stack vertically on mobile (flex-direction column)
  TC-MOB-023  Grid collapses to single column on mobile
  TC-MOB-024  App loads with zero SEVERE console errors on mobile
  TC-MOB-025  Lock button hidden on non-password sections (mobile)
"""
import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from conftest import (
    nav_to, nav_sub, get_severe_errors, sheet_is_open,
    element_rect, viewport_width, viewport_height, has_horizontal_scroll,
    MOBILE_DEVICE, idb_put, wait_clickable,
)

SECTIONS = ['home', 'ivault', 'family', 'passwords', 'reminders', 'settings']
SUB_TABS = ['financeDashboard', 'income', 'expenses', 'budget',
            'investments', 'gold', 'loans', 'banks', 'transactions']


class TestMobileViewport:

    def test_TC_MOB_001_viewport_meta_present(self, mobile_driver):
        """Viewport meta tag must set width=device-width and initial-scale=1."""
        content = mobile_driver.execute_script(
            "var m=document.querySelector('meta[name=\"viewport\"]');"
            "return m ? m.getAttribute('content') : '';"
        )
        assert 'width=device-width' in content, f'viewport meta missing device-width: {content}'
        assert 'initial-scale=1' in content, f'viewport meta missing initial-scale=1: {content}'

    def test_TC_MOB_002_viewport_width_matches_device(self, mobile_driver):
        """window.innerWidth should equal the emulated device width (393px)."""
        w = viewport_width(mobile_driver)
        assert w == MOBILE_DEVICE['width'], f'Expected {MOBILE_DEVICE["width"]}px, got {w}px'

    def test_TC_MOB_003_no_horizontal_scroll_home(self, mobile_driver):
        """Home section must not cause horizontal scrollbar."""
        assert not has_horizontal_scroll(mobile_driver), \
            'Horizontal scroll detected on Home — content overflows viewport'

    def test_TC_MOB_024_no_severe_errors_on_load(self, mobile_driver):
        """App must load with zero SEVERE console errors on mobile."""
        errors = get_severe_errors(mobile_driver)
        assert errors == [], f'SEVERE console errors on mobile load: {errors}'


class TestMobileLayout:

    def test_TC_MOB_004_stats_grid_two_columns_on_mobile(self, mobile_driver):
        """
        On mobile (<720px) the .stats grid should render 2 columns.
        Verify by checking that the first two stat cards have the same top
        offset (same row) and the 3rd card has a different (lower) top offset.
        """
        rects = mobile_driver.execute_script("""
            var cards = Array.from(document.querySelectorAll('#home .stat'));
            return cards.slice(0,3).map(function(c){
                var r = c.getBoundingClientRect();
                return {top: r.top, left: r.left, width: r.width};
            });
        """)
        assert len(rects) >= 3, 'Expected at least 3 stat cards on Home'
        # Cards 0 and 1 should be on the same row (same top ± 2px tolerance)
        assert abs(rects[0]['top'] - rects[1]['top']) < 5, \
            'First two stat cards are not on the same row — expected 2-column layout'
        # Card 2 should be on a new row (lower top)
        assert rects[2]['top'] > rects[0]['top'] + 5, \
            'Third stat card is not on a new row — expected 2-column layout'

    def test_TC_MOB_023_grid_single_column_on_mobile(self, mobile_driver):
        """
        .grid elements (2-col on desktop) should collapse to 1 column on mobile.
        Check that two sibling .grid children have the same left offset (stacked).
        """
        nav_to(mobile_driver, 'settings')
        time.sleep(0.5)
        result = mobile_driver.execute_script("""
            var grid = document.querySelector('#settings .grid');
            if(!grid) return null;
            var children = Array.from(grid.children).filter(function(c){
                return c.offsetParent !== null;
            });
            if(children.length < 2) return null;
            return {
                left0: children[0].getBoundingClientRect().left,
                left1: children[1].getBoundingClientRect().left,
                top0:  children[0].getBoundingClientRect().top,
                top1:  children[1].getBoundingClientRect().top
            };
        """)
        assert result is not None, 'Could not find .grid with 2+ children in Settings'
        # In single-column layout both children share the same left offset
        assert abs(result['left0'] - result['left1']) < 5, \
            f'Grid children have different left offsets — not single-column: {result}'
        # And the second child is below the first
        assert result['top1'] > result['top0'], \
            'Grid children are not stacked vertically on mobile'

    def test_TC_MOB_022_item_cards_stack_vertically(self, mobile_driver):
        """
        .item cards should stack (flex-direction: column) on mobile.
        Verify by checking computed flex-direction on a visible .item.
        """
        flex_dir = mobile_driver.execute_script("""
            var item = document.querySelector('.item');
            if(!item) return null;
            return window.getComputedStyle(item).flexDirection;
        """)
        assert flex_dir == 'column', \
            f'Expected .item flex-direction:column on mobile, got: {flex_dir}'

    def test_TC_MOB_021_content_has_padding_on_mobile(self, mobile_driver):
        """
        .content wrapper must have left/right padding so text is not flush
        against the screen edge.
        """
        padding = mobile_driver.execute_script("""
            var c = document.querySelector('.content');
            if(!c) return null;
            var s = window.getComputedStyle(c);
            return {left: parseFloat(s.paddingLeft), right: parseFloat(s.paddingRight)};
        """)
        assert padding is not None, '.content element not found'
        assert padding['left'] >= 10, f'Left padding too small: {padding["left"]}px'
        assert padding['right'] >= 10, f'Right padding too small: {padding["right"]}px'


class TestMobileNavigation:

    def test_TC_MOB_005_bottom_nav_visible(self, mobile_driver):
        """Bottom nav bar must be visible and within viewport bounds."""
        rect = element_rect(mobile_driver, '.bottom', by_id=False)
        assert rect is not None, '.bottom nav not found'
        vw = viewport_width(mobile_driver)
        vh = viewport_height(mobile_driver)
        assert rect['width'] > 0, 'Bottom nav has zero width'
        assert rect['bottom'] <= vh + 2, \
            f'Bottom nav extends below viewport: bottom={rect["bottom"]}, vh={vh}'

    def test_TC_MOB_006_all_nav_buttons_within_viewport(self, mobile_driver):
        """All 6 nav buttons must fit within the viewport width."""
        vw = viewport_width(mobile_driver)
        results = mobile_driver.execute_script("""
            var btns = Array.from(document.querySelectorAll('.nav button'));
            return btns.map(function(b){
                var r = b.getBoundingClientRect();
                return {text: b.textContent.trim(), right: r.right, left: r.left};
            });
        """)
        assert len(results) == 6, f'Expected 6 nav buttons, found {len(results)}'
        for btn in results:
            assert btn['right'] <= vw + 2, \
                f'Nav button "{btn["text"]}" overflows viewport: right={btn["right"]}, vw={vw}'
            assert btn['left'] >= -2, \
                f'Nav button "{btn["text"]}" starts outside viewport: left={btn["left"]}'

    def test_TC_MOB_007_nav_buttons_touch_target_height(self, mobile_driver):
        """Each nav button must be at least 44px tall (WCAG touch target)."""
        heights = mobile_driver.execute_script("""
            var btns = Array.from(document.querySelectorAll('.nav button'));
            return btns.map(function(b){
                return {text: b.textContent.trim(), height: b.getBoundingClientRect().height};
            });
        """)
        for btn in heights:
            assert btn['height'] >= 44, \
                f'Nav button "{btn["text"]}" is only {btn["height"]}px tall — below 44px touch target'

    def test_TC_MOB_020_all_sections_navigable_on_mobile(self, mobile_driver):
        """All 6 sections must be reachable via bottom nav on mobile."""
        for section in SECTIONS:
            nav_to(mobile_driver, section)
            time.sleep(0.4)
            is_active = mobile_driver.execute_script(
                "var el=document.getElementById(arguments[0]);"
                "return el ? el.classList.contains('active') : false;",
                section
            )
            assert is_active, f'Section #{section} did not become active on mobile'


class TestMobileSections:

    def test_TC_MOB_008_home_no_overflow(self, mobile_driver):
        """Home section content must not overflow horizontally."""
        assert not has_horizontal_scroll(mobile_driver), \
            'Horizontal overflow on Home section'

    def test_TC_MOB_009_ivault_no_overflow(self, mobile_driver):
        """iVault section must not cause horizontal overflow."""
        nav_to(mobile_driver, 'ivault')
        time.sleep(0.5)
        assert not has_horizontal_scroll(mobile_driver), \
            'Horizontal overflow on iVault section'

    def test_TC_MOB_010_ivault_subtabs_scrollable(self, mobile_driver):
        """
        iVault sub-tab row (.tabs) must have overflow-x set to allow
        horizontal scrolling when tabs exceed viewport width on mobile.
        """
        nav_to(mobile_driver, 'ivault')
        time.sleep(0.4)
        overflow = mobile_driver.execute_script(
            "var t=document.querySelector('#ivault .tabs');"
            "return t ? window.getComputedStyle(t).overflowX : null;"
        )
        assert overflow in ('auto', 'scroll', 'overlay'), \
            f'iVault .tabs overflow-x is "{overflow}" — tabs may not scroll on mobile'

    def test_TC_MOB_011_family_no_overflow(self, mobile_driver):
        """Family section must not cause horizontal overflow."""
        nav_to(mobile_driver, 'family')
        time.sleep(0.5)
        assert not has_horizontal_scroll(mobile_driver), \
            'Horizontal overflow on Family section'

    def test_TC_MOB_012_passwords_no_overflow(self, mobile_driver):
        """Passwords section must not cause horizontal overflow."""
        nav_to(mobile_driver, 'passwords')
        time.sleep(0.5)
        assert not has_horizontal_scroll(mobile_driver), \
            'Horizontal overflow on Passwords section'

    def test_TC_MOB_013_reminders_no_overflow(self, mobile_driver):
        """Reminders section must not cause horizontal overflow."""
        nav_to(mobile_driver, 'reminders')
        time.sleep(0.5)
        assert not has_horizontal_scroll(mobile_driver), \
            'Horizontal overflow on Reminders section'

    def test_TC_MOB_014_settings_no_overflow(self, mobile_driver):
        """Settings section must not cause horizontal overflow."""
        nav_to(mobile_driver, 'settings')
        time.sleep(0.5)
        assert not has_horizontal_scroll(mobile_driver), \
            'Horizontal overflow on Settings section'

    def test_TC_MOB_019_ivault_subtabs_tappable(self, mobile_driver):
        """All 9 iVault sub-tab buttons must be tappable on mobile."""
        nav_to(mobile_driver, 'ivault')
        time.sleep(0.4)
        for sub in SUB_TABS:
            nav_sub(mobile_driver, sub)
            errors = get_severe_errors(mobile_driver)
            assert errors == [], \
                f'SEVERE errors after tapping sub-tab "{sub}": {errors}'


class TestMobileSheets:

    def test_TC_MOB_015_sheet_width_within_viewport(self, mobile_driver):
        """Open sheet must not exceed viewport width."""
        nav_to(mobile_driver, 'passwords')
        time.sleep(0.3)
        mobile_driver.execute_script(
            "var b=document.getElementById('addPassBtn'); if(b) b.click();"
        )
        time.sleep(0.6)
        vw = viewport_width(mobile_driver)
        sheet_rect = element_rect(mobile_driver, '.sheet', by_id=False)
        if sheet_rect:
            assert sheet_rect['width'] <= vw + 2, \
                f'Sheet width {sheet_rect["width"]}px exceeds viewport {vw}px'
        # Close modal
        mobile_driver.execute_script(
            "var b=document.getElementById('modalClose'); if(b) b.click();"
        )

    def test_TC_MOB_016_sheet_height_within_viewport(self, mobile_driver):
        """Open sheet max-height must not exceed viewport height."""
        nav_to(mobile_driver, 'passwords')
        time.sleep(0.3)
        mobile_driver.execute_script(
            "var b=document.getElementById('addPassBtn'); if(b) b.click();"
        )
        time.sleep(0.6)
        vh = viewport_height(mobile_driver)
        sheet_rect = element_rect(mobile_driver, '.sheet', by_id=False)
        if sheet_rect:
            assert sheet_rect['height'] <= vh + 2, \
                f'Sheet height {sheet_rect["height"]}px exceeds viewport {vh}px'
        mobile_driver.execute_script(
            "var b=document.getElementById('modalClose'); if(b) b.click();"
        )


class TestMobileTouchTargets:

    def test_TC_MOB_017_add_password_btn_tappable(self, mobile_driver):
        """Add Password button must be visible and tappable on mobile."""
        nav_to(mobile_driver, 'passwords')
        time.sleep(0.3)
        rect = element_rect(mobile_driver, 'addPassBtn')
        assert rect is not None, '#addPassBtn not found'
        assert rect['width'] > 0 and rect['height'] > 0, \
            'Add Password button has zero size on mobile'
        vw = viewport_width(mobile_driver)
        assert rect['right'] <= vw + 2, \
            f'Add Password button overflows viewport: right={rect["right"]}, vw={vw}'

    def test_TC_MOB_018_add_person_btn_tappable(self, mobile_driver):
        """Add Person button must be visible and tappable on mobile."""
        nav_to(mobile_driver, 'family')
        time.sleep(0.3)
        rect = element_rect(mobile_driver, 'addPersonBtn')
        assert rect is not None, '#addPersonBtn not found'
        assert rect['width'] > 0 and rect['height'] > 0, \
            'Add Person button has zero size on mobile'
        vw = viewport_width(mobile_driver)
        assert rect['right'] <= vw + 2, \
            f'Add Person button overflows viewport: right={rect["right"]}, vw={vw}'

    def test_TC_MOB_025_lock_btn_hidden_on_non_password_sections(self, mobile_driver):
        """Lock button must be hidden when not on PasswordVault section."""
        # On Home the lock button should not be visible
        lock_visible = mobile_driver.execute_script(
            "var b=document.getElementById('lockBtn');"
            "if(!b) return false;"
            "var s=window.getComputedStyle(b);"
            "return s.display !== 'none' && b.offsetParent !== null;"
        )
        assert not lock_visible, \
            'Lock button is visible on Home — should only show on PasswordVault'
