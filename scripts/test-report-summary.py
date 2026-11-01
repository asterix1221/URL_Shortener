#!/usr/bin/env python3
"""Сводка прогона тестов сервиса: число тестов по surefire/failsafe и покрытие JaCoCo.

Пишет markdown в GITHUB_STEP_SUMMARY (если переменная задана) и badge-json для
shields.io endpoint. Используется CI и локально:
    python scripts/test-report-summary.py shortener-service/target docs/coverage.json
"""
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET

STATUSES = [("surefire", "Юнит-тесты"), ("failsafe", "Интеграционные тесты")]


def suites(target, kind):
    tests = failures = errors = skipped = 0
    for path in glob.glob(os.path.join(target, kind + "-reports", "TEST-*.xml")):
        suite = ET.parse(path).getroot()
        tests += int(suite.get("tests", 0))
        failures += int(suite.get("failures", 0))
        errors += int(suite.get("errors", 0))
        skipped += int(suite.get("skipped", 0))
    return {"tests": tests, "failures": failures, "errors": errors, "skipped": skipped}


def line_coverage(target):
    path = os.path.join(target, "site", "jacoco", "jacoco.xml")
    if not os.path.exists(path):
        # отчёта нет, когда сборка упала до JaCoCo: сводка по тестам всё равно нужна
        return None
    report = ET.parse(path).getroot()
    for counter in report.findall("counter"):
        if counter.get("type") == "LINE":
            covered, missed = int(counter.get("covered")), int(counter.get("missed"))
            return round(100.0 * covered / (covered + missed), 1)
    raise SystemExit("no LINE counter in jacoco.xml")


def color(percent):
    # пороги зеркалят гейт JaCoCo: 100% по строкам — единственное «зелёное» состояние
    if percent >= 100:
        return "green"
    return "yellowgreen" if percent >= 80 else "orange" if percent >= 60 else "red"


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "shortener-service/target"
    badge = sys.argv[2] if len(sys.argv) > 2 else "docs/coverage.json"

    rows = {kind: suites(target, kind) for kind, _ in STATUSES}
    total = sum(row["tests"] for row in rows.values())
    broken = sum(row["failures"] + row["errors"] for row in rows.values())
    percent = line_coverage(target)

    lines = [
        "## Тесты сервиса",
        "",
        "| Набор | Тестов | Упало | Пропущено |",
        "|---|---|---|---|",
    ]
    for kind, title in STATUSES:
        row = rows[kind]
        failed = row["failures"] + row["errors"]
        lines.append(f"| {title} | {row['tests']} | {failed} | {row['skipped']} |")
    coverage = "не измерено (прогон не дошёл до JaCoCo)" if percent is None else f"{percent}%"
    lines += [
        "",
        f"**Всего: {total} тестов, проваленных: {broken}. Покрытие строк (JaCoCo): {coverage}.**",
        "",
        "HTML-отчёт покрытия — в артефакте `service-coverage` (`index.html`).",
    ]
    summary = "\n".join(lines)
    print(summary)

    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as handle:
            handle.write(summary + "\n")

    if percent is not None:
        with open(badge, "w", encoding="utf-8") as handle:
            json.dump({
                "schemaVersion": 1,
                "label": "JaCoCo coverage",
                "message": f"{percent}%",
                "color": color(percent),
            }, handle)
            handle.write("\n")

    if broken:
        raise SystemExit(f"провалено тестов: {broken}")


if __name__ == "__main__":
    main()
