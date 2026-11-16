"""
배정 변경 감지. 지난 실행 때의 행사 목록(state.json)과 지금 HAS 메인 화면을 비교한다.

  - 새 팀           : 처음 보는 행사코드로만 이루어진 팀 → "새 일감"
  - 예약 추가        : 이미 알던 팀에 새 행사코드가 붙음
  - 예약 빠짐        : 알던 행사코드가 출발 전에 사라짐(사무실에서 배정 변경)
  - 인원 변경        : 같은 행사코드의 인원이 바뀜
  - 팀 전체 빠짐     : 출발 전인데 팀의 행사코드가 모두 사라짐 → "배정 취소"
행사가 끝나서(출발일이 지나서) 화면에서 사라진 것은 변경으로 보지 않는다.
"""
import json
from dataclasses import dataclass, field
from datetime import date


@dataclass
class TeamChange:
    group: object                          # 지금 화면의 팀(parse_main.Group)
    new_team: bool                         # 팀 전체가 처음 보는 일감
    lines: list = field(default_factory=list)  # "➕ 추가 …" 같은 변경 내역
    prev_total: int | None = None          # 변경 전 총인원(알 수 있을 때)


def snapshot(groups):
    return {
        t.code: {
            "start": t.start.isoformat(), "end": t.end.isoformat(), "pax": t.pax,
            "adult": t.adult, "child": t.child, "infant": t.infant, "title": t.title,
            "flight": f"{t.flight_from} {t.flight_no}".strip(),
        }
        for g in groups for t in g.tours
    }


def load(state_file, seen_file):
    """지난 상태. 예전 버전의 seen_codes.json 만 있으면 인원 정보 없이 코드만 알고 있는 것으로 본다."""
    if state_file.exists():
        return json.loads(state_file.read_text(encoding="utf-8"))
    if seen_file.exists():
        return {code: None for code in json.loads(seen_file.read_text(encoding="utf-8"))}
    return None


def code_start(code, info):
    """출발일. 저장된 값이 없으면 행사코드 안의 YYMMDD(7~12번째 글자)로 추정한다."""
    if info:
        return date.fromisoformat(info["start"])
    try:
        return date(2000 + int(code[6:8]), int(code[8:10]), int(code[10:12]))
    except ValueError:
        return None


def _pax(info):
    """빠진 예약을 알아볼 수 있게 지난번에 알던 인원 구성과 항공편을 붙인다."""
    if not info:
        return "인원 미상(이전 기록 없음)"
    text = f"{info['pax']}명"
    if "adult" in info:
        kinds = [f"성인 {info['adult']}"] + [f"{k} {info[key]}" for k, key in (("아동", "child"), ("유아", "infant")) if info[key]]
        text += f" ({', '.join(kinds)})"
    if info.get("flight"):
        text += f" · {info['flight']}"
    return text


def diff(prev, groups, today):
    """(바뀐 팀 목록, 통째로 빠진 팀 목록) 을 돌려준다.
    통째로 빠진 팀은 [(행사코드, 지난 정보), ...] 묶음의 목록이다."""
    current = {t.code for g in groups for t in g.tours}
    # 출발 전인데 사라진 행사코드
    removed = {
        code: info for code, info in prev.items()
        if code not in current and (code_start(code, info) or today) > today
    }
    changes = []
    for g in groups:
        start = min(t.start for t in g.tours)
        added = [t for t in g.tours if t.code not in prev]
        resized = [t for t in g.tours if prev.get(t.code) and prev[t.code]["pax"] != t.pax]
        gone = {c: i for c, i in removed.items() if abs((code_start(c, i) - start).days) <= 1}
        for c in gone:
            removed.pop(c)
        if not (added or resized or gone):
            continue
        if len(added) == len(g.tours) and not gone:
            changes.append(TeamChange(g, new_team=True))
            continue
        lines = [f"➕ 추가 {t.code} · {t.pax}명" for t in added]
        lines += [f"➖ 빠짐 {c} · {_pax(i)}" for c, i in gone.items()]
        lines += [f"🔁 인원 변경 {t.code} · {prev[t.code]['pax']}명 → {t.pax}명" for t in resized]
        before = [prev.get(t.code) for t in g.tours if t.code in prev] + list(gone.values())
        # 총인원은 일일투어 같은 부가 행사(시작일=종료일)를 빼고 센다(요약 메시지와 같은 기준).
        main_before = [i for i in before if i and i.get("end", "") != i["start"]]
        prev_total = sum(i["pax"] for i in main_before) if before and all(before) else None
        changes.append(TeamChange(g, new_team=False, lines=lines, prev_total=prev_total))

    # 지금 화면의 어느 팀에도 붙지 않는 빠진 코드 = 팀 전체가 빠짐. 출발일 하루 이내끼리 묶는다.
    cancelled = []
    for code, info in sorted(removed.items(), key=lambda x: code_start(*x)):
        if cancelled and (code_start(code, info) - code_start(*cancelled[-1][0])).days <= 1:
            cancelled[-1].append((code, info))
        else:
            cancelled.append([(code, info)])
    return changes, cancelled


def cancel_message(team):
    start = min(code_start(c, i) for c, i in team)
    known = [i for _, i in team if i]
    total = f" · 총 {sum(i['pax'] for i in known)}명" if len(known) == len(team) else ""
    lines = ["⚠️ 일감 취소 (배정에서 빠짐)", f"**{start:%m/%d} 출발{total}**"]
    for code, info in team:
        lines.append(f"➖ {code} · {_pax(info)}")
    return "\n".join(lines)
